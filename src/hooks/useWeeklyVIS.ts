import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeImpactScore, computeVISTotal } from "@/lib/scoring";

export interface VISBreakdown {
  normalizedImpact: number;
  deliveryScore: number;
  multiplierScore: number;
  focusRatio: number;
  rawImpact?: number;
  badgeDistribution?: Record<string, number>;
  badgeImpactPct?: Record<string, number>;
}

export interface WeeklyVISResult {
  visTotal: number;
  breakdown: VISBreakdown;
  isEstimate: boolean;
  weekStart: string;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().split("T")[0];
}

function isCurrentWeek(weekStart: string): boolean {
  return weekStart === getWeekStart(new Date());
}

/**
 * Hook to get VIS score for a member.
 * - Past weeks: reads from weekly_vis_scores table (canonical)
 * - Current week: computes mid-week estimate client-side from impact_classifications
 */
export function useWeeklyVIS(
  memberId: string | undefined,
  teamId: string | undefined,
  weekStart?: string
) {
  const targetWeek = weekStart || getWeekStart(new Date());
  const isCurrent = isCurrentWeek(targetWeek);

  // For past weeks, read canonical scores
  const canonicalQuery = useQuery({
    queryKey: ["weekly-vis-canonical", memberId, teamId, targetWeek],
    enabled: !!memberId && !!teamId && !isCurrent,
    staleTime: 60 * 60 * 1000, // 1hr cache for historical
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_vis_scores" as any)
        .select("*")
        .eq("team_id", teamId!)
        .eq("member_id", memberId!)
        .eq("week_start", targetWeek)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // For current week, compute estimate from classifications
  const estimateQuery = useQuery({
    queryKey: ["weekly-vis-estimate", memberId, teamId, targetWeek],
    enabled: !!memberId && !!teamId && isCurrent,
    staleTime: 5 * 60 * 1000, // 5min cache for live estimate
    queryFn: async () => {
      const weekEnd = new Date(targetWeek);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

      // Fetch this week's classifications for this member
      const { data: classifications } = await supabase
        .from("impact_classifications" as any)
        .select("impact_score, focus_alignment, activity_id, source_type")
        .eq("team_id", teamId!)
        .eq("member_id", memberId!)
        .gte("created_at", `${targetWeek}T00:00:00Z`)
        .lt("created_at", weekEnd.toISOString());

      // Fetch activity badges for this member's team
      const { data: badges } = await supabase
        .from("activity_badges")
        .select("activity_id, badge_key")
        .eq("team_id", teamId!);

      const badgeLookup: Record<string, string> = {};
      for (const b of (badges || []) as any[]) {
        badgeLookup[b.activity_id] = b.badge_key;
      }

      const items = (classifications || []) as any[];
      const rawImpact = items.reduce((sum: number, c: any) => sum + (Number(c.impact_score) || 0), 0);
      const alignedCount = items.filter((c: any) => c.focus_alignment === "direct" || c.focus_alignment === "indirect").length;
      const focusRatio = items.length > 0 ? (alignedCount / items.length) * 100 : 0;

      // Aggregate impact by badge type
      const badgeDistribution: Record<string, number> = {};
      for (const c of items) {
        const score = Number(c.impact_score) || 0;
        const badgeKey = badgeLookup[c.activity_id] || "unknown";
        badgeDistribution[badgeKey] = (badgeDistribution[badgeKey] || 0) + score;
      }
      const totalBadgeImpact = Object.values(badgeDistribution).reduce((s, v) => s + v, 0);
      const badgeImpactPct: Record<string, number> = {};
      if (totalBadgeImpact > 0) {
        for (const [key, val] of Object.entries(badgeDistribution)) {
          badgeImpactPct[key] = Math.round((val / totalBadgeImpact) * 1000) / 10;
        }
      }

      // Fetch commitment completion for this week
      const { data: commitments } = await supabase
        .from("commitments")
        .select("status")
        .eq("team_id", teamId!)
        .eq("member_id", memberId!)
        .gte("created_at", `${targetWeek}T00:00:00Z`)
        .lt("created_at", weekEnd.toISOString());

      const totalCommitments = (commitments || []).length;
      const doneCommitments = (commitments || []).filter((c) => c.status === "done").length;
      const deliveryScore = totalCommitments > 0 ? (doneCommitments / totalCommitments) * 100 : 50;

      // Fetch review count
      const { data: reviews } = await supabase
        .from("external_activity")
        .select("id")
        .eq("team_id", teamId!)
        .eq("member_id", memberId!)
        .eq("activity_type", "pr_review")
        .gte("occurred_at", `${targetWeek}T00:00:00Z`)
        .lt("occurred_at", weekEnd.toISOString());

      const reviewCount = (reviews || []).length;
      const multiplierScore = Math.min(100, (reviewCount / 10) * 100);

      // Fetch ALL team members' classifications for this week to compute median
      const { data: allClassifications } = await supabase
        .from("impact_classifications" as any)
        .select("member_id, impact_score")
        .eq("team_id", teamId!)
        .gte("created_at", `${targetWeek}T00:00:00Z`)
        .lt("created_at", weekEnd.toISOString());

      // Aggregate raw impact per member
      const memberRawImpacts = new Map<string, number>();
      for (const c of (allClassifications || []) as any[]) {
        memberRawImpacts.set(
          c.member_id,
          (memberRawImpacts.get(c.member_id) || 0) + (Number(c.impact_score) || 0)
        );
      }

      // Compute team median
      const allRaw = Array.from(memberRawImpacts.values()).sort((a, b) => a - b);
      let median = 1;
      if (allRaw.length > 0) {
        const mid = Math.floor(allRaw.length / 2);
        median = allRaw.length % 2 === 1
          ? allRaw[mid]
          : (allRaw[mid - 1] + allRaw[mid]) / 2;
        if (median === 0) median = 1;
      }

      const normalizedImpact = Math.min(100, (rawImpact / median) * 50);

      const visTotal = computeVISTotal({
        normalizedImpact: Math.min(100, normalizedImpact),
        deliveryScore: Math.min(100, deliveryScore),
        multiplierScore,
        focusRatio: Math.min(100, focusRatio),
      });

      return {
        visTotal,
        breakdown: {
          normalizedImpact: Math.round(normalizedImpact * 100) / 100,
          deliveryScore: Math.round(deliveryScore * 100) / 100,
          multiplierScore: Math.round(multiplierScore * 100) / 100,
          focusRatio: Math.round(focusRatio * 100) / 100,
          rawImpact,
          badgeDistribution,
          badgeImpactPct,
        },
        isEstimate: true,
        weekStart: targetWeek,
      } as WeeklyVISResult;
    },
  });

  if (isCurrent) {
    return {
      data: estimateQuery.data ?? null,
      isLoading: estimateQuery.isLoading,
      error: estimateQuery.error,
    };
  }

  // Transform canonical data to WeeklyVISResult shape
  const canonical = canonicalQuery.data;
  const result: WeeklyVISResult | null = canonical
    ? {
        visTotal: Number(canonical.vis_total),
        breakdown: {
          normalizedImpact: Number(canonical.normalized_impact),
          deliveryScore: Number(canonical.delivery_score),
          multiplierScore: Number(canonical.multiplier_score),
          focusRatio: Number(canonical.focus_ratio),
          rawImpact: Number(canonical.raw_impact),
          badgeDistribution: (canonical.breakdown as any)?.badgeDistribution,
          badgeImpactPct: (canonical.breakdown as any)?.badgeImpactPct,
        },
        isEstimate: false,
        weekStart: canonical.week_start,
      }
    : null;

  return {
    data: result,
    isLoading: canonicalQuery.isLoading,
    error: canonicalQuery.error,
  };
}
