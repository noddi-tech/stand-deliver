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
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    // Get all teams with active focus areas
    const { data: teams } = await sb.from("teams").select("id");
    const insights: any[] = [];

    for (const team of teams || []) {
      const teamId = team.id;

      // Get active focus areas
      const { data: focusItems } = await sb
        .from("team_focus")
        .select("id, title, label, starts_at")
        .eq("team_id", teamId)
        .eq("is_active", true);

      if (!focusItems || focusItems.length === 0) continue;

      for (const focus of focusItems) {
        // Check carry-forward rate for commitments linked to this focus area
        const { data: classifications } = await sb
          .from("impact_classifications")
          .select("activity_id")
          .eq("team_id", teamId)
          .eq("focus_item_id", focus.id)
          .eq("source_type", "commitment");

        const commitmentIds = (classifications || []).map((c: any) => c.activity_id);
        if (commitmentIds.length < 3) continue; // Need enough data

        let totalCommitments = 0;
        let carriedCount = 0;

        for (let i = 0; i < commitmentIds.length; i += 500) {
          const chunk = commitmentIds.slice(i, i + 500);
          const { data: commitments } = await sb
            .from("commitments")
            .select("status, carry_count")
            .in("id", chunk);
          for (const c of commitments || []) {
            totalCommitments++;
            if (c.carry_count > 0) carriedCount++;
          }
        }

        const carryRate = totalCommitments > 0 ? carriedCount / totalCommitments : 0;

        // High carry-forward rate insight
        if (carryRate > 0.3 && totalCommitments >= 5) {
          // Check if similar insight already exists (not dismissed)
          const { data: existingInsight } = await sb
            .from("focus_insights")
            .select("id")
            .eq("team_id", teamId)
            .eq("focus_item_id", focus.id)
            .eq("insight_type", "carry_rate_high")
            .eq("is_dismissed", false)
            .maybeSingle();

          if (!existingInsight) {
            insights.push({
              team_id: teamId,
              focus_item_id: focus.id,
              insight_type: "carry_rate_high",
              title: `High carry-forward rate on "${focus.title}"`,
              description: `${Math.round(carryRate * 100)}% of commitments in "${focus.title}" have been carried forward at least once. Consider reducing scope or re-prioritizing.`,
              confidence: Math.min(0.5 + carryRate, 0.95),
            });
          }
        }

        // Check for recurring blocker categories
        if (commitmentIds.length > 0) {
          const allBlockers: any[] = [];
          for (let i = 0; i < commitmentIds.length; i += 500) {
            const chunk = commitmentIds.slice(i, i + 500);
            const { data: blockers } = await sb
              .from("blockers")
              .select("category")
              .eq("team_id", teamId)
              .in("commitment_id", chunk);
            allBlockers.push(...(blockers || []));
          }

          const categoryCounts: Record<string, number> = {};
          for (const b of allBlockers) {
            categoryCounts[b.category] = (categoryCounts[b.category] || 0) + 1;
          }

          for (const [category, count] of Object.entries(categoryCounts)) {
            if (count >= 3) {
              const { data: existingInsight } = await sb
                .from("focus_insights")
                .select("id")
                .eq("team_id", teamId)
                .eq("focus_item_id", focus.id)
                .eq("insight_type", "blocker_recurring")
                .eq("is_dismissed", false)
                .maybeSingle();

              if (!existingInsight) {
                insights.push({
                  team_id: teamId,
                  focus_item_id: focus.id,
                  insight_type: "blocker_recurring",
                  title: `Recurring ${category} blockers on "${focus.title}"`,
                  description: `${count} "${category}" blockers have been logged for "${focus.title}". This pattern may indicate a systemic issue.`,
                  confidence: Math.min(0.6 + (count * 0.05), 0.95),
                });
              }
            }
          }
        }
      }
    }

    // Insert all new insights
    if (insights.length > 0) {
      await sb.from("focus_insights").insert(insights);
    }

    return new Response(JSON.stringify({ insights_created: insights.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("focus-insight-cron error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
