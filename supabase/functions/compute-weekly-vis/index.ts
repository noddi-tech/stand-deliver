import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computeVISTotal, computeNormalizedImpact } from "../_shared/scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Compute week boundaries (last COMPLETE week: Mon 00:00 → Sun 23:59)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(now.getUTCDate() - 1);

    const dayOfWeek = yesterday.getUTCDay();
    const daysToLastSunday = dayOfWeek === 0 ? 0 : dayOfWeek;

    const lastSunday = new Date(yesterday);
    lastSunday.setUTCDate(yesterday.getUTCDate() - daysToLastSunday);
    lastSunday.setUTCHours(23, 59, 59, 999);

    const lastMonday = new Date(lastSunday);
    lastMonday.setUTCDate(lastSunday.getUTCDate() - 6);
    lastMonday.setUTCHours(0, 0, 0, 0);

    const weekStart = lastMonday.toISOString().split("T")[0];
    const weekEndTs = lastSunday.toISOString();
    const weekStartTs = lastMonday.toISOString();

    // Get all teams
    const { data: teams } = await sb.from("teams").select("id");
    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify({ message: "No teams" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalProcessed = 0;

    for (const team of teams) {
      const teamId = team.id;

      // Fetch reference baseline from vis_config (service role bypasses RLS)
      const { data: visConfig } = await sb
        .from("vis_config")
        .select("reference_baseline")
        .eq("team_id", teamId)
        .maybeSingle();
      const referenceBaseline = Number(visConfig?.reference_baseline) || 100;

      // Get active members
      const { data: members } = await sb
        .from("team_members")
        .select("id")
        .eq("team_id", teamId)
        .eq("is_active", true);

      if (!members || members.length === 0) continue;
      const memberIds = members.map((m) => m.id);

      // Fetch impact_classifications for this week
      const { data: classifications } = await sb
        .from("impact_classifications")
        .select("member_id, impact_score, focus_alignment, activity_id, source_type")
        .eq("team_id", teamId)
        .gte("created_at", weekStartTs)
        .lte("created_at", weekEndTs);

      // Fetch activity_badges for badge distribution
      const { data: badges } = await sb
        .from("activity_badges")
        .select("activity_id, source_type, badge_key")
        .eq("team_id", teamId);

      const badgeLookup: Record<string, string> = {};
      for (const b of badges || []) {
        badgeLookup[b.activity_id] = b.badge_key;
      }

      // Aggregate per member
      const memberScores: Record<string, { rawImpact: number; alignedCount: number; totalCount: number; badgeImpact: Record<string, number> }> = {};
      for (const mid of memberIds) {
        memberScores[mid] = { rawImpact: 0, alignedCount: 0, totalCount: 0, badgeImpact: {} };
      }

      for (const c of classifications || []) {
        if (!memberScores[c.member_id]) continue;
        const score = Number(c.impact_score) || 0;
        memberScores[c.member_id].rawImpact += score;
        memberScores[c.member_id].totalCount++;
        if (c.focus_alignment === "direct" || c.focus_alignment === "indirect") {
          memberScores[c.member_id].alignedCount++;
        }
        const badgeKey = badgeLookup[c.activity_id] || "unknown";
        memberScores[c.member_id].badgeImpact[badgeKey] = (memberScores[c.member_id].badgeImpact[badgeKey] || 0) + score;
      }

      // Fetch commitment completion rates
      const { data: commitments } = await sb
        .from("commitments")
        .select("member_id, status")
        .eq("team_id", teamId)
        .in("member_id", memberIds)
        .gte("created_at", weekStartTs)
        .lte("created_at", weekEndTs);

      const memberCommitments: Record<string, { total: number; done: number }> = {};
      for (const mid of memberIds) memberCommitments[mid] = { total: 0, done: 0 };
      for (const c of commitments || []) {
        if (!memberCommitments[c.member_id]) continue;
        memberCommitments[c.member_id].total++;
        if (c.status === "done") memberCommitments[c.member_id].done++;
      }

      // Fetch review counts for multiplier score
      const { data: reviews } = await sb
        .from("external_activity")
        .select("member_id")
        .eq("team_id", teamId)
        .eq("activity_type", "pr_review")
        .in("member_id", memberIds)
        .gte("occurred_at", weekStartTs)
        .lte("occurred_at", weekEndTs);

      const memberReviews: Record<string, number> = {};
      for (const mid of memberIds) memberReviews[mid] = 0;
      for (const r of reviews || []) {
        if (memberReviews[r.member_id] !== undefined) memberReviews[r.member_id]++;
      }

      // Compute and upsert VIS for each member
      for (const mid of memberIds) {
        const scores = memberScores[mid];

        // Absolute-baseline normalization (same formula everywhere)
        const normalizedImpact = computeNormalizedImpact(scores.rawImpact, referenceBaseline);

        const commitData = memberCommitments[mid];
        const deliveryScore = commitData.total > 0
          ? Math.min(100, (commitData.done / commitData.total) * 100)
          : 50;

        const multiplierScore = Math.min(100, (memberReviews[mid] / 10) * 100);

        const focusRatio = scores.totalCount > 0
          ? Math.min(100, (scores.alignedCount / scores.totalCount) * 100)
          : 0;

        const visTotal = computeVISTotal({
          rawImpact: scores.rawImpact,
          deliveryScore,
          multiplierScore,
          focusRatio,
        }, referenceBaseline);

        // Badge distribution percentages
        const badgeDistribution = scores.badgeImpact;
        const totalBadgeImpact = Object.values(badgeDistribution).reduce((s, v) => s + v, 0);
        const badgeImpactPct: Record<string, number> = {};
        if (totalBadgeImpact > 0) {
          for (const [key, val] of Object.entries(badgeDistribution)) {
            badgeImpactPct[key] = Math.round((val / totalBadgeImpact) * 1000) / 10;
          }
        }

        const breakdown = {
          rawImpact: scores.rawImpact,
          normalizedImpact: Math.round(normalizedImpact * 100) / 100,
          deliveryScore: Math.round(deliveryScore * 100) / 100,
          multiplierScore: Math.round(multiplierScore * 100) / 100,
          focusRatio: Math.round(focusRatio * 100) / 100,
          commitments: commitData,
          reviews: memberReviews[mid],
          classifications: scores.totalCount,
          alignedClassifications: scores.alignedCount,
          badgeDistribution,
          badgeImpactPct,
          referenceBaseline,
        };

        await sb.from("weekly_vis_scores").upsert(
          {
            team_id: teamId,
            member_id: mid,
            week_start: weekStart,
            raw_impact: scores.rawImpact,
            normalized_impact: Math.round(normalizedImpact * 100) / 100,
            delivery_score: Math.round(deliveryScore * 100) / 100,
            multiplier_score: Math.round(multiplierScore * 100) / 100,
            focus_ratio: Math.round(focusRatio * 100) / 100,
            vis_total: visTotal,
            breakdown,
          },
          { onConflict: "team_id,member_id,week_start" }
        );

        totalProcessed++;
      }
    }

    console.log(`Computed weekly VIS for ${totalProcessed} members (week: ${weekStart})`);

    return new Response(
      JSON.stringify({ processed: totalProcessed, week_start: weekStart }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("compute-weekly-vis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
