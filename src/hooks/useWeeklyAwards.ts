import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek, differenceInHours } from "date-fns";

export interface WeeklyAward {
  type: "mvp" | "unsung_hero" | "momentum";
  emoji: string;
  title: string;
  memberName: string;
  memberId: string;
  description: string;
  stat: string;
}

export interface DORAMetrics {
  avgPRCycleTime: number | null;
  prMergeRate: number; // PRs merged per week
  changeFailureRate: number; // reverted/dropped PRs %
  reviewTurnaround: number | null;
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

export function useWeeklyAwards(teamId: string | undefined) {
  return useQuery({
    queryKey: ["weekly-awards", teamId],
    enabled: !!teamId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const thisWeekStart = startOfWeek(now);
      const lastWeekStart = startOfWeek(subDays(now, 7));
      const twoWeeksAgo = subDays(now, 14).toISOString();

      // Fetch 2 weeks of GitHub activity
      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, activity_type, member_id, occurred_at, metadata, member:team_members!inner(id, user_id, profile:profiles!inner(full_name))")
        .eq("team_id", teamId!)
        .eq("source", "github")
        .gte("occurred_at", twoWeeksAgo)
        .order("occurred_at", { ascending: false })
        .limit(1000);

      // Fetch commitments for the period
      const { data: commitments } = await supabase
        .from("commitments")
        .select("id, status, member_id, created_at, resolved_at, carry_count")
        .eq("team_id", teamId!)
        .gte("created_at", twoWeeksAgo);

      // Fetch VIS impact classifications for the period
      const { data: classifications } = await supabase
        .from("impact_classifications")
        .select("member_id, impact_score, created_at")
        .eq("team_id", teamId!)
        .gte("created_at", twoWeeksAgo);

      const items = activities || [];
      const allCommitments = commitments || [];
      const allClassifications = classifications || [];

      // Build per-member VIS score map per week
      const visScoreMap = new Map<string, Map<string, number>>(); // weekKey -> memberId -> totalScore
      for (const c of allClassifications) {
        const d = new Date(c.created_at);
        const weekKey = d >= thisWeekStart ? "this" : (d >= lastWeekStart ? "last" : "skip");
        if (weekKey === "skip") continue;
        if (!visScoreMap.has(weekKey)) visScoreMap.set(weekKey, new Map());
        const weekMap = visScoreMap.get(weekKey)!;
        weekMap.set(c.member_id, (weekMap.get(c.member_id) || 0) + Number(c.impact_score));
      }

      // Split into this week vs last week
      const thisWeekItems = items.filter(i => new Date(i.occurred_at) >= thisWeekStart);
      const lastWeekItems = items.filter(i => {
        const d = new Date(i.occurred_at);
        return d >= lastWeekStart && d < thisWeekStart;
      });

      // Per-member stats for this week
      interface MemberStats {
        name: string;
        memberId: string;
        impactScore: number;
        reviewsGiven: number;
        prsOpened: number;
        prsMerged: number;
        avgCycleTime: number | null;
        commitCount: number;
        commitmentsCompleted: number;
      }

      function computeMemberStats(weekItems: typeof items, weekStart: Date, weekKey: "this" | "last"): Map<string, MemberStats> {
        const memberMap = new Map<string, MemberStats>();
        const weekVisMap = visScoreMap.get(weekKey) || new Map<string, number>();

        for (const item of weekItems) {
          const m = item.member as any;
          const id = item.member_id;
          if (!memberMap.has(id)) {
            memberMap.set(id, {
              name: m?.profile?.full_name || "Unknown",
              memberId: id,
              impactScore: 0,
              reviewsGiven: 0,
              prsOpened: 0,
              prsMerged: 0,
              avgCycleTime: null,
              commitCount: 0,
              commitmentsCompleted: 0,
            });
          }
          const stats = memberMap.get(id)!;

          if (item.activity_type === "commit") {
            stats.commitCount++;
          } else if (item.activity_type === "pr_review") {
            stats.reviewsGiven++;
          } else if (item.activity_type === "pr_opened") {
            stats.prsOpened++;
          } else if (item.activity_type === "pr_merged") {
            stats.prsMerged++;
          }
        }

        // Apply VIS scores; fall back to commit count heuristic for unclassified members
        for (const [id, stats] of memberMap) {
          const visScore = weekVisMap.get(id);
          if (visScore !== undefined && visScore > 0) {
            stats.impactScore = Math.round(visScore);
          } else {
            // Fallback: simple commit-based estimate for members without classifications
            stats.impactScore = stats.commitCount * 10;
          }
        }

        // Add commitment completions
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
        for (const c of allCommitments) {
          const created = new Date(c.created_at);
          if (created >= weekStart && created < weekEnd && c.status === "done") {
            const ms = memberMap.get(c.member_id);
            if (ms) ms.commitmentsCompleted++;
          }
        }

        return memberMap;
      }

      const thisWeekMap = computeMemberStats(thisWeekItems, thisWeekStart, "this");
      const lastWeekMap = computeMemberStats(lastWeekItems, lastWeekStart, "last");

      const awards: WeeklyAward[] = [];
      const thisWeekMembers = Array.from(thisWeekMap.values()).filter(m => m.commitCount + m.reviewsGiven + m.commitmentsCompleted > 0);

      if (thisWeekMembers.length > 0) {
        // MVP: highest composite of impact + reviews + completions
        const mvp = thisWeekMembers.reduce((best, m) => {
          const score = m.impactScore + m.reviewsGiven * 20 + m.commitmentsCompleted * 15;
          const bestScore = best.impactScore + best.reviewsGiven * 20 + best.commitmentsCompleted * 15;
          return score > bestScore ? m : best;
        });
        const mvpScore = mvp.impactScore + mvp.reviewsGiven * 20 + mvp.commitmentsCompleted * 15;
        if (mvpScore > 0) {
          awards.push({
            type: "mvp",
            emoji: "🏆",
            title: "MVP",
            memberName: mvp.name,
            memberId: mvp.memberId,
            description: "Highest composite of code impact, reviews, and commitments completed",
            stat: `Impact: ${mvp.impactScore} · Reviews: ${mvp.reviewsGiven} · Done: ${mvp.commitmentsCompleted}`,
          });
        }

        // Unsung Hero: most reviews given relative to own PRs
        const hero = thisWeekMembers
          .filter(m => m.reviewsGiven >= 2)
          .reduce<MemberStats | null>((best, m) => {
            const ratio = m.reviewsGiven / Math.max(m.prsOpened, 1);
            const bestRatio = best ? best.reviewsGiven / Math.max(best.prsOpened, 1) : 0;
            return ratio > bestRatio ? m : best;
          }, null);
        if (hero && hero.memberId !== mvp.memberId) {
          awards.push({
            type: "unsung_hero",
            emoji: "🦸",
            title: "Unsung Hero",
            memberName: hero.name,
            memberId: hero.memberId,
            description: "Most reviews given relative to own PRs — lifting others up",
            stat: `${hero.reviewsGiven} reviews given · ${hero.prsOpened} PRs opened`,
          });
        }

        // Momentum: biggest week-over-week improvement
        let bestImprovement = 0;
        let momentumMember: MemberStats | null = null;
        for (const m of thisWeekMembers) {
          const lastWeek = lastWeekMap.get(m.memberId);
          const lastScore = lastWeek ? lastWeek.impactScore + lastWeek.reviewsGiven * 20 + lastWeek.commitmentsCompleted * 15 : 0;
          const thisScore = m.impactScore + m.reviewsGiven * 20 + m.commitmentsCompleted * 15;
          const improvement = lastScore > 0 ? (thisScore - lastScore) / lastScore : thisScore > 30 ? 1 : 0;
          if (improvement > bestImprovement && m.memberId !== mvp.memberId) {
            bestImprovement = improvement;
            momentumMember = m;
          }
        }
        if (momentumMember && bestImprovement > 0.2) {
          awards.push({
            type: "momentum",
            emoji: "🚀",
            title: "Momentum",
            memberName: momentumMember.name,
            memberId: momentumMember.memberId,
            description: "Biggest week-over-week improvement in output",
            stat: `+${Math.round(bestImprovement * 100)}% vs last week`,
          });
        }
      }

      // DORA-style metrics
      const thisWeekPRsMerged = thisWeekItems.filter(i => i.activity_type === "pr_merged");
      const lastWeekPRsMerged = lastWeekItems.filter(i => i.activity_type === "pr_merged");
      const thisWeekReviews = thisWeekItems.filter(i => i.activity_type === "pr_review").length;
      const lastWeekReviews = lastWeekItems.filter(i => i.activity_type === "pr_review").length;

      // Cycle times
      function avgCycleTime(prs: typeof items): number | null {
        const times: number[] = [];
        for (const pr of prs) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.merged_at) {
            const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) times.push(hours);
          }
        }
        return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10 : null;
      }

      // Review turnaround
      function avgReviewTime(prs: typeof items): number | null {
        const times: number[] = [];
        for (const pr of prs.filter(i => i.activity_type === "pr_opened")) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.first_review_at) {
            const hours = differenceInHours(new Date(meta.first_review_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) times.push(hours);
          }
        }
        return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10 : null;
      }

      const thisWeekCycle = avgCycleTime(thisWeekPRsMerged);
      const lastWeekCycle = avgCycleTime(lastWeekPRsMerged);

      const doraMetrics: DORAMetrics = {
        avgPRCycleTime: thisWeekCycle,
        prMergeRate: thisWeekPRsMerged.length,
        changeFailureRate: 0, // Would need revert detection
        reviewTurnaround: avgReviewTime(thisWeekItems),
        weekOverWeekTrends: {
          cycleTime: thisWeekCycle !== null && lastWeekCycle !== null
            ? trend(lastWeekCycle, thisWeekCycle) // lower is better, so flip
            : "flat",
          mergeRate: trend(thisWeekPRsMerged.length, lastWeekPRsMerged.length),
          reviews: trend(thisWeekReviews, lastWeekReviews),
        },
      };

      return { awards, doraMetrics };
    },
  });
}
