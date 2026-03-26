import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { v1_focus_id, v2_focus_id, team_id } = await req.json();
    if (!v1_focus_id || !v2_focus_id || !team_id) {
      throw new Error("Missing v1_focus_id, v2_focus_id, or team_id");
    }

    // Check for existing gap analysis
    const { data: existing } = await sb
      .from("focus_gap_analyses")
      .select("*")
      .eq("v1_focus_id", v1_focus_id)
      .eq("v2_focus_id", v2_focus_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch v1 retrospective
    const { data: retrospective } = await sb
      .from("focus_retrospectives")
      .select("*")
      .eq("focus_item_id", v1_focus_id)
      .eq("status", "complete")
      .maybeSingle();

    // Fetch v1 and v2 focus items
    const { data: v1Focus } = await sb.from("team_focus").select("*").eq("id", v1_focus_id).single();
    const { data: v2Focus } = await sb.from("team_focus").select("*").eq("id", v2_focus_id).single();

    if (!v1Focus || !v2Focus) throw new Error("Focus items not found");

    // Fetch deferred/carried commitments from v1
    const { data: v1Classifications } = await sb
      .from("impact_classifications")
      .select("activity_id, source_type")
      .eq("team_id", team_id)
      .eq("focus_item_id", v1_focus_id);

    const commitmentIds = (v1Classifications || [])
      .filter((c: any) => c.source_type === "commitment")
      .map((c: any) => c.activity_id);

    let deferredItems: any[] = [];
    if (commitmentIds.length > 0) {
      const { data: carried } = await sb
        .from("commitments")
        .select("id, title, status, carry_count, blocked_reason")
        .in("id", commitmentIds)
        .in("status", ["carried", "blocked", "active"]);
      deferredItems = carried || [];
    }

    // Fetch unresolved blockers from v1
    let unresolvedBlockers: any[] = [];
    if (commitmentIds.length > 0) {
      const { data: blockers } = await sb
        .from("blockers")
        .select("description, category, days_open")
        .eq("team_id", team_id)
        .eq("is_resolved", false)
        .in("commitment_id", commitmentIds);
      unresolvedBlockers = blockers || [];
    }

    let suggestions: any[] = [];

    if (lovableKey) {
      try {
        const prompt = `You are a project planning analyst. A team completed focus area v1 and is now creating v2.

V1 Focus Area: "${v1Focus.title}"
V1 Description: ${v1Focus.description || "None"}
V1 Tags: ${v1Focus.label}

V2 Focus Area: "${v2Focus.title}"
V2 Description: ${v2Focus.description || "None"}
V2 Tags: ${v2Focus.label}

${retrospective ? `V1 Retrospective:
${retrospective.ai_narrative || "No narrative available"}

V1 Metrics: ${JSON.stringify(retrospective.metrics)}` : "No retrospective available for v1."}

Deferred/Carried items from v1: ${JSON.stringify(deferredItems.map(d => ({ title: d.title, status: d.status, carries: d.carry_count })))}

Unresolved blockers from v1: ${JSON.stringify(unresolvedBlockers.map(b => ({ description: b.description, category: b.category, days_open: b.days_open })))}

Generate a JSON response with gap analysis suggestions. Each suggestion should have:
{
  "suggestions": [
    {
      "suggestion_id": "unique-uuid-string",
      "title": "short action title",
      "description": "detailed explanation",
      "type": "deferred|blocker|capacity|improvement|new",
      "priority": "high|medium|low",
      "source": "what v1 data this came from"
    }
  ]
}

Include:
1. Any deferred items that should be prioritized in v2
2. Blockers that might recur and mitigation strategies
3. Capacity recommendations based on v1 completion rate
4. Improvements based on v1 patterns
5. New suggestions for v2 scope based on gaps

Generate 3-8 suggestions. Use real UUIDs for suggestion_id.`;

        const resp = await fetch("https://ai.lovable.dev/chat/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a project planning analyst. Respond only with valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (resp.ok) {
          const aiResult = await resp.json();
          const content = aiResult.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            suggestions = (parsed.suggestions || []).map((s: any) => ({
              ...s,
              suggestion_id: s.suggestion_id || crypto.randomUUID(),
              accepted: null, // null = pending, true = accepted, false = rejected
            }));
          }
        }
      } catch (aiErr) {
        console.error("AI gap analysis failed:", aiErr);
      }
    }

    // Fallback: generate suggestions from data without AI
    if (suggestions.length === 0) {
      for (const item of deferredItems) {
        suggestions.push({
          suggestion_id: crypto.randomUUID(),
          title: `Carry forward: ${item.title}`,
          description: `This item was ${item.status} in v1 with ${item.carry_count} carry-forwards.`,
          type: "deferred",
          priority: item.carry_count > 2 ? "high" : "medium",
          source: "v1_commitments",
          accepted: null,
        });
      }
      for (const blocker of unresolvedBlockers) {
        suggestions.push({
          suggestion_id: crypto.randomUUID(),
          title: `Address blocker: ${blocker.description.substring(0, 50)}`,
          description: `Unresolved ${blocker.category} blocker open for ${blocker.days_open} days.`,
          type: "blocker",
          priority: blocker.days_open > 5 ? "high" : "medium",
          source: "v1_blockers",
          accepted: null,
        });
      }
    }

    // Persist the gap analysis
    const { data: inserted, error: insertErr } = await sb
      .from("focus_gap_analyses")
      .insert({
        v1_focus_id,
        v2_focus_id,
        team_id,
        suggestions,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ai-focus-gap-analysis error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
