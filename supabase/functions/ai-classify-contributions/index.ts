import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const sb = createClient(supabaseUrl, serviceKey);

    // 1. Fetch active focus items
    const { data: focusItems, error: focusErr } = await sb
      .from("team_focus")
      .select("*")
      .eq("team_id", team_id)
      .eq("is_active", true);
    if (focusErr) throw focusErr;
    if (!focusItems || focusItems.length === 0) {
      return new Response(JSON.stringify({ error: "No focus items defined" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch team members
    const { data: members } = await sb
      .from("team_members")
      .select("id, role, user_id, profiles!inner(full_name)")
      .eq("team_id", team_id)
      .eq("is_active", true);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ error: "No team members" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberMap: Record<string, string> = {};
    for (const m of members) {
      memberMap[m.id] = (m as any).profiles?.full_name || "Unknown";
    }
    const memberIds = members.map((m) => m.id);

    // 3. Fetch recent activity (7 days)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: activities } = await sb
      .from("external_activity")
      .select("id, external_id, member_id, title, activity_type, source, metadata")
      .eq("team_id", team_id)
      .in("member_id", memberIds)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500);

    // 4. Fetch recent commitments
    const { data: commitments } = await sb
      .from("commitments")
      .select("id, member_id, title, status")
      .eq("team_id", team_id)
      .in("member_id", memberIds)
      .gte("created_at", since)
      .limit(200);

    // 5. Build context for AI
    const focusDescriptions = focusItems.map(
      (f: any) => `- "${f.title}" [label: ${f.label}]${f.description ? ` — ${f.description}` : ""}`
    ).join("\n");

    const memberActivities: Record<string, string[]> = {};
    for (const mid of memberIds) {
      memberActivities[mid] = [];
    }

    for (const a of activities || []) {
      const desc = `[${a.source}/${a.activity_type}] ${a.title}`;
      if (memberActivities[a.member_id]) {
        memberActivities[a.member_id].push(`id:${a.external_id} ${desc}`);
      }
    }
    for (const c of commitments || []) {
      const desc = `[standup/commitment:${c.status}] ${c.title}`;
      if (memberActivities[c.member_id]) {
        memberActivities[c.member_id].push(`id:commitment-${c.id} ${desc}`);
      }
    }

    const memberSections = memberIds.map((mid) => {
      const name = memberMap[mid];
      const acts = memberActivities[mid] || [];
      return `## ${name} (${mid})\n${acts.length > 0 ? acts.slice(0, 30).join("\n") : "No recent activity"}`;
    }).join("\n\n");

    const focusLabels = [...new Set(focusItems.map((f: any) => f.label))];

    const systemPrompt = `You are an engineering manager's assistant. Classify each team member's recent work against the team's defined focus areas.

Team Focus Areas:
${focusDescriptions}

Focus labels: ${focusLabels.join(", ")}

For each member, estimate what percentage of their recent work falls into each focus label. Work that doesn't align with any focus area is "Unaligned". Percentages must sum to 100.

Also provide a brief rationale (one sentence) for each activity explaining why it maps to that focus label or is unaligned.`;

    const userPrompt = `Classify the following team members' recent contributions:\n\n${memberSections}`;

    // 6. Call AI with tool calling for structured output
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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_contributions",
              description: "Return per-member value breakdown and per-activity classifications",
              parameters: {
                type: "object",
                properties: {
                  memberBreakdowns: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        memberId: { type: "string" },
                        memberName: { type: "string" },
                        breakdown: {
                          type: "object",
                          description: "Map of focus label -> percentage (0-100). Must include 'Unaligned' key. All values sum to 100.",
                          additionalProperties: { type: "number" },
                        },
                      },
                      required: ["memberId", "memberName", "breakdown"],
                      additionalProperties: false,
                    },
                  },
                  classifications: {
                    type: "array",
                    description: "Per-activity classification with rationale",
                    items: {
                      type: "object",
                      properties: {
                        externalId: { type: "string" },
                        focusLabel: { type: "string", description: "One of the focus labels or 'Unaligned'" },
                        rationale: { type: "string", description: "One sentence explaining the classification" },
                      },
                      required: ["externalId", "focusLabel", "rationale"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["memberBreakdowns", "classifications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_contributions" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        memberBreakdowns: parsed.memberBreakdowns,
        classifications: parsed.classifications,
        generatedAt: new Date().toISOString(),
      }),
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
