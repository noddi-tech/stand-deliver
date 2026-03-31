import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek } from "date-fns";
import { computeNormalizedImpact } from "@/lib/scoring";

export interface WeeklyAward {
  type: "mvp" | "unsung_hero" | "momentum";
  emoji: string;
  title: string;
  memberName: string;
  memberId: string;
  description: string;
  stat: string;
}

// Re-export DORAMetrics type for backward compat (now lives in useTeamMomentum)
export type { TeamMomentum as DORAMetrics } from "./useTeamMomentum";

export function useWeeklyAwards(teamId: string | undefined) {
  return useQuery({
    queryKey: ["weekly-awards", teamId],
    enabled: !!teamId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      const twoWeeksAgo = subDays(now, 14).toISOString();

      // Fetch reference baseline from vis_config
      const { data: visConfig } = await supabase
        .from("vis_config" as any)
        .select("reference_baseline")
        .eq("team_id", teamId!)
        .maybeSingle();
      const referenceBaseline = Number((visConfig as any)?.reference_baseline) || 100;

      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, activity_type, member_id, occurred_at, metadata, member:team_members!inner(id, user_id, profile:profiles!inner(full_name))")
        .eq("team_id", teamId!)
        .eq("source", "github")
        .gte("occurred_at", twoWeeksAgo)
        .order("occurred_at", { ascending: false })
        .limit(1000);

      const { data: commitments } = await supabase
        .from("commitments")
        .select("id, status, member_id, created_at, resolved_at, carry_count")
        .eq("team_id", teamId!)
        .gte("created_at", twoWeeksAgo);

      // Fetch VIS impact classifications
      const { data: classifications } = await supabase
        .from("impact_classifications")
        .select("member_id, impact_score, created_at")
        .eq("team_id", teamId!)
        .gte("created_at", twoWeeksAgo);

      const items = activities || [];
      const allCommitments = commitments || [];
      const allClassifications = classifications || [];

      // Build raw VIS score map per week
      const visScoreMap = new Map<string, Map<string, number>>();
      for (const c of allClassifications) {
        const d = new Date(c.created_at);
        const weekKey = d >= thisWeekStart ? "this" : (d >= lastWeekStart ? "last" : "skip");
        if (weekKey === "skip") continue;
        if (!visScoreMap.has(weekKey)) visScoreMap.set(weekKey, new Map());
        const weekMap = visScoreMap.get(weekKey)!;
        weekMap.set(c.member_id, (weekMap.get(c.member_id) || 0) + Number(c.impact_score));
      }

      const thisWeekItems = items.filter(i => new Date(i.occurred_at) >= thisWeekStart);
      const lastWeekItems = items.filter(i => {
        const d = new Date(i.occurred_at);
        return d >= lastWeekStart && d < thisWeekStart;
      });

      interface MemberStats {
        name: string;
        memberId: string;
        impactScore: number;
        reviewsGiven: number;
        prsOpened: number;
        prsMerged: number;
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
              commitCount: 0,
              commitmentsCompleted: 0,
            });
          }
          const stats = memberMap.get(id)!;
          if (item.activity_type === "commit") stats.commitCount++;
          else if (item.activity_type === "pr_review") stats.reviewsGiven++;
          else if (item.activity_type === "pr_opened") stats.prsOpened++;
          else if (item.activity_type === "pr_merged") stats.prsMerged++;
        }

        // Apply VIS scores — absolute-baseline normalization (unified formula)
        for (const [id, rawScore] of weekVisMap) {
          if (!memberMap.has(id)) {
            memberMap.set(id, {
              name: "Unknown",
              memberId: id,
              impactScore: 0,
              reviewsGiven: 0,
              prsOpened: 0,
              prsMerged: 0,
              commitCount: 0,
              commitmentsCompleted: 0,
            });
          }
          memberMap.get(id)!.impactScore = Math.round(
            computeNormalizedImpact(rawScore, referenceBaseline)
          );
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
      const lastWeekMembers = Array.from(lastWeekMap.values()).filter(m => m.commitCount + m.reviewsGiven + m.commitmentsCompleted > 0);

      // Fallback to last week when current week has insufficient data
      const hasEnoughData = thisWeekMembers.some(m => m.impactScore > 0 || m.commitCount > 0);
      const displayMembers = hasEnoughData ? thisWeekMembers : lastWeekMembers;
      const displayLabel = hasEnoughData ? "This Week" : "Last Week";

      if (displayMembers.length > 0) {
        // MVP
        const mvp = displayMembers.reduce((best, m) => {
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
            description: "Highest composite of VIS impact, reviews, and commitments completed",
            stat: `VIS: ${mvp.impactScore}/100 · Reviews: ${mvp.reviewsGiven} · Done: ${mvp.commitmentsCompleted}`,
          });
        }

        // Unsung Hero
        const hero = displayMembers
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

        // Momentum (only when showing current week data)
        let bestImprovement = 0;
        let momentumMember: MemberStats | null = null;
        if (hasEnoughData) {
        for (const m of displayMembers) {
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
        } // close hasEnoughData guard for momentum
      }

      return { awards, displayLabel };
    },
  });
}
