import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computeImpactScore } from "../_shared/scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ClassifyItem {
  id: string;
  source_type: "external_activity" | "commitment" | "standup_response";
  source?: string;
  activity_type?: string;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  member_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id, items } = await req.json();
    if (!team_id) throw new Error("team_id required");
    if (!items || !Array.isArray(items) || items.length === 0) throw new Error("items array required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch active focus items
    const { data: focusItems } = await sb
      .from("team_focus")
      .select("id, title, label, description, starts_at, ends_at")
      .eq("team_id", team_id)
      .eq("is_active", true);

    const focusContext = (focusItems && focusItems.length > 0)
      ? focusItems.map((f: any) => `- [${f.id}] "${f.title}" (label: ${f.label})${f.description ? ` — ${f.description}` : ""}`).join("\n")
      : "No focus areas defined. Classify all items as focus_alignment: 'none'.";

    const focusIds = (focusItems || []).map((f: any) => f.id);

    // Build items context for prompt (cap at 20)
    const batch = (items as ClassifyItem[]).slice(0, 20);
    const itemLines = batch.map((item, i) => {
      let line = `[${i}] (${item.source_type}/${item.source || "standup"}/${item.activity_type || "commitment"}) "${item.title}"`;
      if (item.description) line += ` — ${item.description}`;
      if (item.metadata) {
        const m = item.metadata;
        if (m.additions !== undefined) line += ` [+${m.additions}/-${m.deletions || 0}, ${m.files_changed || 0} files]`;
        if (m.repo) line += ` [repo: ${m.repo}]`;
        if (m.status) line += ` [status: ${m.status}]`;
      }
      return line;
    }).join("\n");

    const systemPrompt = `You are an engineering impact classifier. For each work item, assess THREE dimensions:

1. **impact_tier** — How significant is this contribution?
   - critical: Production incidents, major launches, architectural decisions
   - high: Feature completions, significant bug fixes, important refactors  
   - standard: Regular development work, routine tasks
   - low: Config changes, typo fixes, minor updates

2. **value_type** — What kind of value does this deliver?
   - ship: Delivering user-facing features or products
   - quality: Bug fixes, testing, reliability improvements
   - foundation: Refactoring, architecture, documentation, tooling
   - growth: Learning, mentoring, knowledge sharing, onboarding
   - unblock: Code reviews, unblocking teammates, resolving blockers

3. **focus_alignment** — Does this align with the team's defined focus areas?
   - direct: Directly addresses a focus area (provide the focus_item_id)
   - indirect: Related to a focus area but not directly addressing it
   - none: Unrelated to any defined focus area

Team Focus Areas:
${focusContext}

${focusIds.length > 0 ? `Valid focus_item_id values: ${focusIds.join(", ")}` : ""}

Classify each item by its index number.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Classify these ${batch.length} work items:\n\n${itemLines}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_items",
              description: "Return classification for each work item by index",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        index: { type: "number" },
                        impact_tier: { type: "string", enum: ["critical", "high", "standard", "low"] },
                        value_type: { type: "string", enum: ["ship", "quality", "foundation", "growth", "unblock"] },
                        focus_alignment: { type: "string", enum: ["direct", "indirect", "none"] },
                        focus_item_id: { type: "string", description: "UUID of matched focus item, or null" },
                        reasoning: { type: "string", description: "One sentence explaining the classification" },
                      },
                      required: ["index", "impact_tier", "value_type", "focus_alignment", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["classifications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_items" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);
    const classifications = parsed.classifications || [];

    // Compute scores and upsert into impact_classifications
    let upsertCount = 0;
    for (const c of classifications) {
      const idx = c.index;
      if (idx < 0 || idx >= batch.length) continue;
      const item = batch[idx];

      const size = item.metadata
        ? (Number(item.metadata.additions) || 0) + (Number(item.metadata.deletions) || 0)
        : 0;

      const score = computeImpactScore({
        impact_tier: c.impact_tier,
        value_type: c.value_type,
        focus_alignment: c.focus_alignment,
        size,
      });

      // Validate focus_item_id
      const focusItemId = (c.focus_alignment === "direct" && c.focus_item_id && focusIds.includes(c.focus_item_id))
        ? c.focus_item_id
        : null;

      const { error } = await sb.from("impact_classifications").upsert(
        {
          activity_id: item.id,
          source_type: item.source_type,
          team_id: team_id,
          member_id: item.member_id,
          impact_tier: c.impact_tier,
          value_type: c.value_type,
          focus_alignment: c.focus_alignment,
          focus_item_id: focusItemId,
          reasoning: c.reasoning || null,
          impact_score: score,
        },
        { onConflict: "activity_id,source_type" }
      );

      if (error) {
        console.error(`Upsert error for item ${item.id}:`, error);
      } else {
        upsertCount++;
      }
    }

    console.log(`Classified ${upsertCount}/${batch.length} items for team ${team_id}`);

    return new Response(
      JSON.stringify({ classified: upsertCount, total: batch.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("classify error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
