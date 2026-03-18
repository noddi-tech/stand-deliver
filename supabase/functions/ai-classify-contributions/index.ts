import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computeImpactScore } from "../_shared/scoring.ts";
import { badgeFromAIClassification, resolveActivityBadge } from "../_shared/activity-badges.ts";

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
      ? focusItems.map((f: any) => {
          let line = `- [${f.id}] "${f.title}" (label: ${f.label})`;
          if (f.description) {
            line += `\n  Objective: ${f.title}`;
            line += `\n  Details: ${f.description}`;
            line += `\n  → Only classify as "direct" if the work itself advances this objective, not just because it involves the same customer/partner.`;
          }
          return line;
        }).join("\n")
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

    const systemPrompt = `You are an impact classifier for a SaaS startup's engineering and product team.
Your job: read a work contribution and classify it along three dimensions.
You do NOT score or rank. You classify. The scoring formula runs separately.

CONTEXT:
- 8-person team: 6 engineers, 2 business/product people who also ship code via
  vibe coding tools (Lovable, v0, Cursor), Figma, and direct commits.
- Everyone's goal: ship the best product possible, grow fast.
- "Value" = did this contribution move the product or business forward?
  Not: was this person busy? Not: did they write a lot of code?

ACTIVE COMPANY FOCUS:
${focusContext}
${focusIds.length > 0 ? `Valid focus_item_id values: ${focusIds.join(", ")}` : ""}

---

CLASSIFICATION DIMENSIONS:

1. impact_tier — How much does this move the needle?

   "critical"  — Directly unblocks revenue, fixes a customer-facing outage,
                  ships a feature that was blocking a deal/launch, or eliminates
                  a significant operational bottleneck. If this didn't happen
                  this week, someone would notice.

   "high"      — Meaningful product advancement: new feature, significant UX
                  improvement, infrastructure that enables future speed,
                  integration that opens a new capability, closing a deal,
                  onboarding a customer. Clearly moves an active focus item.

   "standard"  — Solid execution: bug fixes, routine improvements, tests,
                  refactors that improve maintainability, task completions,
                  documentation, spec writing. Necessary work that keeps
                  the machine running.

   "low"       — Chores, dependency bumps, config tweaks, formatting changes,
                  CI fixes, meeting notes with no action items. Has to be done
                  but doesn't advance the product.

2. value_type — What kind of value does this create?

   "ship"          — Puts something new in front of users or customers.
                     Features, UI changes, new endpoints, landing pages,
                     customer-facing fixes.

   "quality"       — Makes existing things better/more reliable. Bug fixes,
                     test coverage, error handling, performance optimization,
                     security patches.

   "foundation"    — Builds capability for future speed. Infra, CI/CD,
                     architecture changes, developer tooling, database
                     migrations that enable features, design systems.

   "growth"        — Directly drives business growth. Sales outreach,
                     customer onboarding, partnership work, marketing
                     materials, competitive analysis, pricing work.

   "unblock"       — Removes a bottleneck for someone else. Code reviews,
                     answering technical questions, writing specs that
                     let others start building, providing designs/mockups
                     that unblock engineering.

3. focus_alignment — Does this map to an active focus item?

   "direct"    — Clearly and directly advances a stated focus item.
                 Include which focus item ID.

   "indirect"  — Supports a focus item but isn't directly part of it.
                 Include which focus item ID.

   "none"      — Doesn't map to any active focus item. This is NOT
                 automatically bad — maintenance, tech debt, and
                 exploratory work are legitimate.

CLASSIFICATION RULES:

- A 3-line fix to a payment bug is "critical/quality" if it was losing revenue.
  A 3000-line auto-generated migration is "low/foundation" if it's routine.
  NEVER use code volume as a proxy for impact.

- PR reviews that are substantive (comments, requested changes, caught bugs)
  are "standard/unblock" minimum. Drive-by "LGTM" approvals are "low/unblock".

- Vibe-coded contributions (from Lovable, v0, Cursor — identifiable by
  bot-authored commits or specific repo patterns): classify the OUTCOME,
  not the method. A working MVP shipped via v0 is just as valuable as
  hand-written code. The impact_tier reflects what was built, not how.

- When in doubt between two tiers, pick the lower one. We'd rather
  under-classify and let volume accumulate than over-classify and inflate.

- Do NOT hallucinate focus alignment. If you're not confident a contribution
  maps to a focus item, output "none". False "direct" is worse than missed
  "direct".

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

      if (response.status === 402 || response.status === 429) {
        const isCredits = response.status === 402;
        return new Response(
          JSON.stringify({
            classified: 0,
            total: batch.length,
            degraded: {
              reason: isCredits ? "credits_exhausted" : "rate_limited",
              status: response.status,
              message: isCredits
                ? "AI credits exhausted. Add credits in Settings → Workspace → Usage."
                : "AI rate limit reached. Please try again in a minute.",
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
      const focusItemId = (
        (c.focus_alignment === "direct" || c.focus_alignment === "indirect") &&
        c.focus_item_id &&
        focusIds.includes(c.focus_item_id)
      ) ? c.focus_item_id : null;

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

    // ─── Bulk badge upsert for all classified items ───
    for (const c of classifications) {
      const idx = c.index;
      if (idx < 0 || idx >= batch.length) continue;
      const item = batch[idx];

      // Use the full resolver — for standup commitments, deterministic badgeFromCommitment
      // runs first; for external_activity, deterministic rules run; AI is the fallback
      const resolution = resolveActivityBadge({
        source: item.source || "standup",
        activity_type: item.activity_type || "commitment",
        title: item.title,
        metadata: item.metadata,
        classification: { value_type: c.value_type, impact_tier: c.impact_tier },
      });

      try {
        await sb.rpc("upsert_activity_badge", {
          p_activity_id: item.id,
          p_source_type: item.source_type,
          p_team_id: team_id,
          p_badge_key: resolution.badge.key,
          p_badge_source: resolution.source,
          p_confidence: resolution.confidence,
        });
      } catch (badgeErr) {
        console.error(`Badge upsert error for ${item.id}:`, badgeErr);
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
