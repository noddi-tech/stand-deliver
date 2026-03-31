import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek, format, differenceInHours } from "date-fns";
import { computeNormalizedImpact } from "@/lib/scoring";

export interface EnrichedMetrics {
  members: EnrichedMemberMetrics[];
  teamTotalReviews: number;
  prCycleTimeTrend: { week: string; avgHours: number }[];
  workTypeDist: { week: string; [key: string]: string | number }[];
  codeImpactTrend: { week: string; impact: number }[];
}

export interface EnrichedMemberMetrics {
  memberId: string;
  memberName: string;
  codeImpactScore: number;
  hasVIS: boolean;
  avgPRCycleTime: number | null;
  reviewsGiven: number;
  reviewsReceived: number;
  avgReviewVelocity: number | null;
  focusScore: number;
  totalAdditions: number;
  totalDeletions: number;
  netLines: number;
  commitCount: number;
  workTypeBreakdown: Record<string, number>;
}

export interface PersonalEnrichedMetrics {
  prCycleTimeTrend: { week: string; avgHours: number }[];
  reviewsGivenVsReceived: { week: string; given: number; received: number }[];
  codeImpactTrend: { week: string; impact: number; additions: number; deletions: number }[];
  workTypeBreakdown: { type: string; count: number }[];
  focusTrend: { week: string; repos: number }[];
  insights: { title: string; description: string; sentiment: "positive" | "neutral" | "warning" }[];
  currentWeekAvgCycleTime: number | null;
  fourWeekAvgCycleTime: number | null;
  reviewsGivenTotal: number;
  reviewsReceivedTotal: number;
}

/** Paginated fetch to bypass Supabase 1000-row default limit */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => any,
): Promise<T[]> {
  const PAGE = 1000;
  let offset = 0;
  const all: T[] = [];
  while (true) {
    const { data } = await buildQuery(offset, offset + PAGE - 1) as { data: T[] | null };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

export function useEnrichedTeamMetrics(teamId: string | undefined, periodDays = 30) {
  return useQuery({
    queryKey: ["enriched-team-metrics", teamId, periodDays],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const sinceDate = subDays(new Date(), periodDays).toISOString();

      // Fetch reference baseline from vis_config
      const { data: visConfig } = await supabase
        .from("vis_config" as any)
        .select("reference_baseline")
        .eq("team_id", teamId!)
        .maybeSingle();
      const referenceBaseline = Number((visConfig as any)?.reference_baseline) || 100;

      // Fetch VIS impact scores — paginated
      const visScores = await fetchAllRows<{ member_id: string; activity_id: string; impact_score: number }>(
        (from, to) =>
          supabase
            .from("impact_classifications")
            .select("member_id, activity_id, impact_score")
            .eq("team_id", teamId!)
            .gte("created_at", sinceDate)
            .range(from, to),
      );

      const visMap = new Map<string, number>();
      for (const row of visScores) {
        visMap.set(row.member_id, (visMap.get(row.member_id) || 0) + Number(row.impact_score));
      }

      // Fetch activity badges for work type classification
      const { data: activityBadges } = await supabase
        .from("activity_badges")
        .select("activity_id, badge_key")
        .eq("team_id", teamId!);

      const badgeLookup = new Map<string, string>();
      for (const b of activityBadges || []) {
        badgeLookup.set(b.activity_id, b.badge_key);
      }

      // Fetch all external activity — paginated
      const activities = await fetchAllRows<any>(
        (from, to) =>
          supabase
            .from("external_activity")
            .select("id, activity_type, title, member_id, occurred_at, metadata, member:team_members!inner(id, user_id, profile:profiles!inner(full_name))")
            .eq("team_id", teamId!)
            .eq("source", "github")
            .gte("occurred_at", sinceDate)
            .order("occurred_at", { ascending: false })
            .range(from, to),
      );

      const items = activities;

      // Group by member
      const memberMap = new Map<string, { name: string; items: typeof items }>();
      for (const item of items) {
        const m = item.member as any;
        const memberId = item.member_id;
        if (!memberMap.has(memberId)) {
          memberMap.set(memberId, { name: m?.profile?.full_name || "Unknown", items: [] });
        }
        memberMap.get(memberId)!.items.push(item);
      }

      const members: EnrichedMemberMetrics[] = [];
      const now = new Date();

      for (const [memberId, { name, items: memberItems }] of memberMap) {
        const commits = memberItems.filter((i) => i.activity_type === "commit");
        const prsOpened = memberItems.filter((i) => i.activity_type === "pr_opened");
        const prsMerged = memberItems.filter((i) => i.activity_type === "pr_merged");
        const reviewsGiven = memberItems.filter((i) => i.activity_type === "pr_review");

        const reviewsReceived = prsOpened.reduce((sum, pr) => {
          const meta = pr.metadata as any;
          return sum + (meta?.review_count || 0);
        }, 0);

        let totalAdditions = 0, totalDeletions = 0;
        for (const c of commits) {
          const meta = c.metadata as any;
          totalAdditions += meta?.additions || 0;
          totalDeletions += meta?.deletions || 0;
        }

        // PR cycle time
        const cycleTimes: number[] = [];
        for (const pr of prsMerged) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.merged_at) {
            const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) cycleTimes.push(hours);
          }
        }

        // Review velocity
        const reviewVelocities: number[] = [];
        for (const pr of prsOpened) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.first_review_at) {
            const hours = differenceInHours(new Date(meta.first_review_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) reviewVelocities.push(hours);
          }
        }

        // Focus score: distinct repos
        const repos = new Set<string>();
        for (const item of memberItems) {
          const meta = item.metadata as any;
          if (meta?.repo) repos.add(meta.repo);
        }

        // Work type from activity_badges (not metadata.work_type)
        const workTypes: Record<string, number> = {};
        for (const item of memberItems) {
          const badge = badgeLookup.get(item.id);
          const wt = badge || "unclassified";
          workTypes[wt] = (workTypes[wt] || 0) + 1;
        }

        // Pure VIS score — no legacy fallback
        const visScore = visMap.get(memberId) || 0;
        const hasVIS = visScore > 0;

        members.push({
          memberId,
          memberName: name,
          codeImpactScore: visScore,
          hasVIS,
          avgPRCycleTime: cycleTimes.length > 0 ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length * 10) / 10 : null,
          reviewsGiven: reviewsGiven.length,
          reviewsReceived,
          avgReviewVelocity: reviewVelocities.length > 0 ? Math.round(reviewVelocities.reduce((a, b) => a + b, 0) / reviewVelocities.length * 10) / 10 : null,
          focusScore: repos.size,
          totalAdditions,
          totalDeletions,
          netLines: totalAdditions - totalDeletions,
          commitCount: commits.length,
          workTypeBreakdown: workTypes,
        });
      }

      // --- VIS Normalization: log-scale, median = 50 ---
      const visMembers = members.filter((m) => m.hasVIS && m.codeImpactScore > 0);

      if (visMembers.length > 0) {
        const logScores = visMembers.map((m) => Math.log10(m.codeImpactScore + 1));
        const sorted = [...logScores].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        let logMedian = sorted.length % 2 === 1
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
        if (logMedian === 0) logMedian = 1;

        for (const m of visMembers) {
          const logScore = Math.log10(m.codeImpactScore + 1);
          m.codeImpactScore = Math.round(
            Math.min(100, Math.max(5, (logScore / logMedian) * 50))
          );
        }

        for (const m of members) {
          if (m.hasVIS && m.codeImpactScore <= 0) {
            m.codeImpactScore = 0;
          }
        }
      }

      // Weekly trends
      const prCycleTimeTrend: { week: string; avgHours: number }[] = [];
      const workTypeDist: Record<string, any>[] = [];
      const codeImpactTrend: { week: string; impact: number }[] = [];

      for (let w = 3; w >= 0; w--) {
        const ws = startOfWeek(subDays(now, w * 7));
        const we = new Date(ws.getTime() + 7 * 86400000);
        const weekLabel = format(ws, "MMM d");

        // PR cycle times for the week
        const weekPRs = items.filter((i) => {
          if (i.activity_type !== "pr_merged") return false;
          const d = new Date(i.occurred_at);
          return d >= ws && d < we;
        });
        const weekCycles: number[] = [];
        for (const pr of weekPRs) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.merged_at) {
            const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) weekCycles.push(hours);
          }
        }
        prCycleTimeTrend.push({
          week: weekLabel,
          avgHours: weekCycles.length > 0 ? Math.round(weekCycles.reduce((a, b) => a + b, 0) / weekCycles.length * 10) / 10 : 0,
        });

        // Work type from activity_badges
        const weekItems = items.filter((i) => {
          const d = new Date(i.occurred_at);
          return d >= ws && d < we;
        });
        const dist: Record<string, string | number> = { week: weekLabel, feature: 0, bugfix: 0, refactor: 0, chore: 0, infra: 0 };
        for (const item of weekItems) {
          const badge = badgeLookup.get(item.id);
          if (badge && badge in dist) (dist as any)[badge]++;
          else (dist as any).chore = ((dist as any).chore || 0) + 1;
        }
        workTypeDist.push(dist);

        // VIS-based code impact per week
        let weekImpact = 0;
        for (const item of weekItems) {
          // Sum VIS scores for items in this week
          const vis = visScores.find(v => v.activity_id === item.id);
          if (vis) weekImpact += Number(vis.impact_score);
        }
        codeImpactTrend.push({ week: weekLabel, impact: Math.round(weekImpact) });
      }

      return {
        members,
        teamTotalReviews: members.reduce((s, m) => s + m.reviewsGiven, 0),
        prCycleTimeTrend,
        workTypeDist,
        codeImpactTrend,
      } as EnrichedMetrics;
    },
  });
}

export function usePersonalEnrichedMetrics(memberId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ["personal-enriched-metrics", memberId, teamId],
    enabled: !!memberId && !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, activity_type, title, member_id, occurred_at, metadata")
        .eq("team_id", teamId!)
        .eq("source", "github")
        .gte("occurred_at", thirtyDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(500);

      // Fetch activity badges for work type
      const { data: activityBadges } = await supabase
        .from("activity_badges")
        .select("activity_id, badge_key")
        .eq("team_id", teamId!);

      const badgeLookup = new Map<string, string>();
      for (const b of activityBadges || []) {
        badgeLookup.set(b.activity_id, b.badge_key);
      }

      // Fetch VIS scores for code impact trend
      const { data: visScores } = await supabase
        .from("impact_classifications")
        .select("activity_id, impact_score, member_id")
        .eq("team_id", teamId!)
        .eq("member_id", memberId!)
        .gte("created_at", thirtyDaysAgo);

      const visLookup = new Map<string, number>();
      for (const v of visScores || []) {
        visLookup.set(v.activity_id, Number(v.impact_score));
      }

      const allItems = activities || [];
      const myItems = allItems.filter((i) => i.member_id === memberId);
      const now = new Date();

      const prCycleTimeTrend: { week: string; avgHours: number }[] = [];
      const reviewsGivenVsReceived: { week: string; given: number; received: number }[] = [];
      const codeImpactTrend: { week: string; impact: number; additions: number; deletions: number }[] = [];
      const focusTrend: { week: string; repos: number }[] = [];

      let currentWeekCycles: number[] = [];
      let fourWeekCycles: number[] = [];
      let totalReviewsGiven = 0;
      let totalReviewsReceived = 0;

      for (let w = 3; w >= 0; w--) {
        const ws = startOfWeek(subDays(now, w * 7));
        const we = new Date(ws.getTime() + 7 * 86400000);
        const weekLabel = format(ws, "MMM d");

        const weekItems = myItems.filter((i) => {
          const d = new Date(i.occurred_at);
          return d >= ws && d < we;
        });

        // PR cycle time
        const weekPRs = weekItems.filter((i) => i.activity_type === "pr_merged");
        const weekCycles: number[] = [];
        for (const pr of weekPRs) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.merged_at) {
            const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) weekCycles.push(hours);
          }
        }
        prCycleTimeTrend.push({
          week: weekLabel,
          avgHours: weekCycles.length > 0 ? Math.round(weekCycles.reduce((a, b) => a + b, 0) / weekCycles.length * 10) / 10 : 0,
        });
        fourWeekCycles.push(...weekCycles);
        if (w === 0) currentWeekCycles = weekCycles;

        // Reviews
        const given = weekItems.filter((i) => i.activity_type === "pr_review").length;
        const received = weekItems
          .filter((i) => i.activity_type === "pr_opened")
          .reduce((sum, pr) => sum + ((pr.metadata as any)?.review_count || 0), 0);
        reviewsGivenVsReceived.push({ week: weekLabel, given, received });
        totalReviewsGiven += given;
        totalReviewsReceived += received;

        // Code impact — VIS-based
        let weekImpact = 0;
        let additions = 0, deletions = 0;
        for (const item of weekItems) {
          const vis = visLookup.get(item.id);
          if (vis) weekImpact += vis;
          if (item.activity_type === "commit") {
            const meta = item.metadata as any;
            additions += meta?.additions || 0;
            deletions += meta?.deletions || 0;
          }
        }
        codeImpactTrend.push({ week: weekLabel, impact: Math.round(weekImpact), additions, deletions });

        // Focus
        const repos = new Set<string>();
        for (const item of weekItems) {
          const meta = item.metadata as any;
          if (meta?.repo) repos.add(meta.repo);
        }
        focusTrend.push({ week: weekLabel, repos: repos.size });
      }

      // Work type from activity_badges
      const workTypes: Record<string, number> = {};
      for (const item of myItems) {
        const badge = badgeLookup.get(item.id) || "unclassified";
        workTypes[badge] = (workTypes[badge] || 0) + 1;
      }
      const workTypeBreakdown = Object.entries(workTypes)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Insights
      const insights: { title: string; description: string; sentiment: "positive" | "neutral" | "warning" }[] = [];

      const currentAvg = currentWeekCycles.length > 0
        ? Math.round(currentWeekCycles.reduce((a, b) => a + b, 0) / currentWeekCycles.length * 10) / 10
        : null;
      const fourWeekAvg = fourWeekCycles.length > 0
        ? Math.round(fourWeekCycles.reduce((a, b) => a + b, 0) / fourWeekCycles.length * 10) / 10
        : null;

      if (currentAvg !== null && fourWeekAvg !== null) {
        if (currentAvg < fourWeekAvg) {
          insights.push({
            title: "PR Cycle Time ⬇️",
            description: `Your PRs are merging faster this week (${currentAvg}h vs ${fourWeekAvg}h avg). Keep shipping small, focused changes!`,
            sentiment: "positive",
          });
        } else if (currentAvg > fourWeekAvg * 1.5) {
          insights.push({
            title: "PR Cycle Time ⬆️",
            description: `PRs are taking longer this week (${currentAvg}h vs ${fourWeekAvg}h avg). Consider breaking large PRs into smaller ones.`,
            sentiment: "warning",
          });
        }
      }

      if (totalReviewsGiven > totalReviewsReceived * 1.5 && totalReviewsGiven > 3) {
        insights.push({
          title: "Team Player 🤝",
          description: `You gave ${totalReviewsGiven} reviews vs ${totalReviewsReceived} received — you're a net contributor to code review!`,
          sentiment: "positive",
        });
      }

      const latestFocus = focusTrend[focusTrend.length - 1]?.repos || 0;
      if (latestFocus <= 2 && latestFocus > 0) {
        insights.push({
          title: "Deep Focus 🎯",
          description: `You touched only ${latestFocus} repo${latestFocus > 1 ? "s" : ""} this week — great focus on fewer contexts!`,
          sentiment: "positive",
        });
      } else if (latestFocus >= 5) {
        insights.push({
          title: "Context Switching ⚠️",
          description: `You worked across ${latestFocus} repos this week. High context switching can reduce code quality.`,
          sentiment: "warning",
        });
      }

      const latestImpact = codeImpactTrend[codeImpactTrend.length - 1];
      if (latestImpact && latestImpact.deletions > latestImpact.additions) {
        insights.push({
          title: "Code Janitor 🧹",
          description: `Net negative lines this week (${latestImpact.additions - latestImpact.deletions}). Cleaning up is valuable work!`,
          sentiment: "positive",
        });
      }

      if (insights.length === 0) {
        insights.push({
          title: "Keep Going",
          description: "Not enough enriched data yet to generate insights. Trigger a GitHub sync with enrichment to see trends.",
          sentiment: "neutral",
        });
      }

      return {
        prCycleTimeTrend,
        reviewsGivenVsReceived,
        codeImpactTrend,
        workTypeBreakdown,
        focusTrend,
        insights,
        currentWeekAvgCycleTime: currentAvg,
        fourWeekAvgCycleTime: fourWeekAvg,
        reviewsGivenTotal: totalReviewsGiven,
        reviewsReceivedTotal: totalReviewsReceived,
      } as PersonalEnrichedMetrics;
    },
  });
}
