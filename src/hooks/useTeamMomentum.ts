import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, subDays, differenceInHours } from "date-fns";

export interface TeamMomentum {
  avgPRCycleTime: number | null;
  prsMerged: number;
  reviewTurnaround: number | null;
  totalReviews: number;
  weekOverWeekTrends: {
    cycleTime: "up" | "down" | "flat";
    mergeRate: "up" | "down" | "flat";
    reviews: "up" | "down" | "flat";
  };
}

function trend(current: number, previous: number): "up" | "down" | "flat" {
  if (previous === 0) return current > 0 ? "up" : "flat";
  const change = (current - previous) / previous;
  if (change > 0.1) return "up";
  if (change < -0.1) return "down";
  return "flat";
}

function avgFromPRs(prs: any[], field: "cycle" | "review"): number | null {
  const times: number[] = [];
  for (const pr of prs) {
    const meta = pr.metadata as any;
    if (field === "cycle" && meta?.created_at && meta?.merged_at) {
      const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
      if (hours >= 0 && hours < 720) times.push(hours);
    }
    if (field === "review" && meta?.created_at && meta?.first_review_at) {
      const hours = differenceInHours(new Date(meta.first_review_at), new Date(meta.created_at));
      if (hours >= 0 && hours < 720) times.push(hours);
    }
  }
  return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10 : null;
}

/**
 * Single source of truth for DORA-style team momentum metrics.
 * Fetches 2 weeks of GitHub activity and computes cycle time, merge rate,
 * review turnaround, and week-over-week trends.
 */
export function useTeamMomentum(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-momentum", teamId],
    enabled: !!teamId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<TeamMomentum> => {
      const now = new Date();
      const thisWeekStart = startOfWeek(now);
      const lastWeekStart = startOfWeek(subDays(now, 7));
      const twoWeeksAgo = subDays(now, 14).toISOString();

      const { data: activities } = await supabase
        .from("external_activity")
        .select("activity_type, member_id, occurred_at, metadata")
        .eq("team_id", teamId!)
        .eq("source", "github")
        .gte("occurred_at", twoWeeksAgo)
        .order("occurred_at", { ascending: false })
        .limit(1000);

      const items = activities || [];
      const thisWeekItems = items.filter(i => new Date(i.occurred_at) >= thisWeekStart);
      const lastWeekItems = items.filter(i => {
        const d = new Date(i.occurred_at);
        return d >= lastWeekStart && d < thisWeekStart;
      });

      const thisWeekPRsMerged = thisWeekItems.filter(i => i.activity_type === "pr_merged");
      const lastWeekPRsMerged = lastWeekItems.filter(i => i.activity_type === "pr_merged");
      const thisWeekReviews = thisWeekItems.filter(i => i.activity_type === "pr_review").length;
      const lastWeekReviews = lastWeekItems.filter(i => i.activity_type === "pr_review").length;

      const thisWeekCycle = avgFromPRs(thisWeekPRsMerged, "cycle");
      const lastWeekCycle = avgFromPRs(lastWeekPRsMerged, "cycle");
      const thisWeekPRsOpened = thisWeekItems.filter(i => i.activity_type === "pr_opened");

      return {
        avgPRCycleTime: thisWeekCycle,
        prsMerged: thisWeekPRsMerged.length,
        reviewTurnaround: avgFromPRs(thisWeekPRsOpened, "review"),
        totalReviews: thisWeekReviews,
        weekOverWeekTrends: {
          cycleTime: thisWeekCycle !== null && lastWeekCycle !== null
            ? trend(lastWeekCycle, thisWeekCycle) // lower is better, flip
            : "flat",
          mergeRate: trend(thisWeekPRsMerged.length, lastWeekPRsMerged.length),
          reviews: trend(thisWeekReviews, lastWeekReviews),
        },
      };
    },
  });
}
