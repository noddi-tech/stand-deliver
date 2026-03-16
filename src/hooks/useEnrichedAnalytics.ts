import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek, format, differenceInHours } from "date-fns";

export interface EnrichedMetrics {
  // Per-member metrics
  members: EnrichedMemberMetrics[];
  // Team-level
  teamAvgCycleTime: number | null; // hours
  teamAvgReviewVelocity: number | null; // hours
  teamTotalReviews: number;
  prCycleTimeTrend: { week: string; avgHours: number }[];
  workTypeDist: { week: string; feature: number; bugfix: number; refactor: number; chore: number; infra: number }[];
  codeImpactTrend: { week: string; impact: number }[];
}

export interface EnrichedMemberMetrics {
  memberId: string;
  memberName: string;
  codeImpactScore: number;
  hasVIS: boolean;
  avgPRCycleTime: number | null; // hours
  reviewsGiven: number;
  reviewsReceived: number;
  avgReviewVelocity: number | null; // hours
  focusScore: number; // distinct repos
  totalAdditions: number;
  totalDeletions: number;
  netLines: number;
  commitCount: number;
  workTypeBreakdown: Record<string, number>;
}

// Personal enriched analytics
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

function computeCodeImpact(additions: number, deletions: number, filesChanged: number): number {
  // Weighted composite: net lines + file breadth bonus
  const netLines = Math.abs(additions - deletions);
  const totalChanged = additions + deletions;
  // Weight: sqrt of total changes (diminishing returns on large diffs) + files bonus
  return Math.round(Math.sqrt(totalChanged) * 2 + filesChanged * 1.5 + netLines * 0.1);
}

export function useEnrichedTeamMetrics(teamId: string | undefined) {
  return useQuery({
    queryKey: ["enriched-team-metrics", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

      // Fetch VIS impact scores from impact_classifications (last 30 days)
      const { data: visScores } = await supabase
        .from("impact_classifications")
        .select("member_id, activity_id, impact_score")
        .eq("team_id", teamId!)
        .gte("created_at", thirtyDaysAgo);

      // Build per-member VIS totals AND a set of classified activity IDs
      const visMap = new Map<string, number>();
      const classifiedActivityIds = new Set<string>();
      for (const row of visScores || []) {
        visMap.set(row.member_id, (visMap.get(row.member_id) || 0) + Number(row.impact_score));
        classifiedActivityIds.add(row.activity_id);
      }

      // Fetch all enriched external activity for the team
      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, activity_type, title, member_id, occurred_at, metadata, member:team_members!inner(id, user_id, profile:profiles!inner(full_name))")
        .eq("team_id", teamId!)
        .eq("source", "github")
        .gte("occurred_at", thirtyDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(1000);

      const items = activities || [];

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

        // Reviews received: PRs opened by this user that have review_count in metadata
        const reviewsReceived = prsOpened.reduce((sum, pr) => {
          const meta = pr.metadata as any;
          return sum + (meta?.review_count || 0);
        }, 0);

        // Code impact from commits
        let totalAdditions = 0, totalDeletions = 0, totalFiles = 0;
        for (const c of commits) {
          const meta = c.metadata as any;
          totalAdditions += meta?.additions || 0;
          totalDeletions += meta?.deletions || 0;
          totalFiles += meta?.files_changed || 0;
        }

        // PR cycle time (from created_at to merged_at in metadata)
        const cycleTimes: number[] = [];
        for (const pr of prsMerged) {
          const meta = pr.metadata as any;
          if (meta?.created_at && meta?.merged_at) {
            const hours = differenceInHours(new Date(meta.merged_at), new Date(meta.created_at));
            if (hours >= 0 && hours < 720) cycleTimes.push(hours); // cap at 30 days
          }
        }

        // Review velocity (PR opened to first review)
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

        // Work type breakdown
        const workTypes: Record<string, number> = {};
        for (const c of commits) {
          const meta = c.metadata as any;
          const wt = meta?.work_type || "unclassified";
          workTypes[wt] = (workTypes[wt] || 0) + 1;
        }

        const visScore = visMap.get(memberId);
        const hasVIS = visScore !== undefined && visScore > 0;

        members.push({
          memberId,
          memberName: name,
          codeImpactScore: hasVIS ? Math.round(visScore) : computeCodeImpact(totalAdditions, totalDeletions, totalFiles),
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

      // Team averages
      const allCycleTimes = members.filter((m) => m.avgPRCycleTime !== null).map((m) => m.avgPRCycleTime!);
      const allReviewVelocities = members.filter((m) => m.avgReviewVelocity !== null).map((m) => m.avgReviewVelocity!);

      // Weekly trends
      const prCycleTimeTrend: { week: string; avgHours: number }[] = [];
      const workTypeDist: { week: string; feature: number; bugfix: number; refactor: number; chore: number; infra: number }[] = [];
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

        // Work type distribution
        const weekCommits = items.filter((i) => {
          if (i.activity_type !== "commit") return false;
          const d = new Date(i.occurred_at);
          return d >= ws && d < we;
        });
        const dist = { week: weekLabel, feature: 0, bugfix: 0, refactor: 0, chore: 0, infra: 0 };
        for (const c of weekCommits) {
          const meta = c.metadata as any;
          const wt = meta?.work_type;
          if (wt && wt in dist) (dist as any)[wt]++;
          else dist.chore++; // unclassified → chore
        }
        workTypeDist.push(dist);

        // Code impact
        let weekImpact = 0;
        for (const c of weekCommits) {
          const meta = c.metadata as any;
          weekImpact += computeCodeImpact(meta?.additions || 0, meta?.deletions || 0, meta?.files_changed || 0);
        }
        codeImpactTrend.push({ week: weekLabel, impact: weekImpact });
      }

      return {
        members,
        teamAvgCycleTime: allCycleTimes.length > 0 ? Math.round(allCycleTimes.reduce((a, b) => a + b, 0) / allCycleTimes.length * 10) / 10 : null,
        teamAvgReviewVelocity: allReviewVelocities.length > 0 ? Math.round(allReviewVelocities.reduce((a, b) => a + b, 0) / allReviewVelocities.length * 10) / 10 : null,
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

      const allItems = activities || [];
      const myItems = allItems.filter((i) => i.member_id === memberId);
      const now = new Date();

      // Weekly trends
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

        // Reviews given (this member reviewed others)
        const given = weekItems.filter((i) => i.activity_type === "pr_review").length;
        // Reviews received (PRs opened by this member that got reviews)
        const received = weekItems
          .filter((i) => i.activity_type === "pr_opened")
          .reduce((sum, pr) => sum + ((pr.metadata as any)?.review_count || 0), 0);
        reviewsGivenVsReceived.push({ week: weekLabel, given, received });
        totalReviewsGiven += given;
        totalReviewsReceived += received;

        // Code impact
        const weekCommits = weekItems.filter((i) => i.activity_type === "commit");
        let additions = 0, deletions = 0, files = 0;
        for (const c of weekCommits) {
          const meta = c.metadata as any;
          additions += meta?.additions || 0;
          deletions += meta?.deletions || 0;
          files += meta?.files_changed || 0;
        }
        codeImpactTrend.push({
          week: weekLabel,
          impact: computeCodeImpact(additions, deletions, files),
          additions,
          deletions,
        });

        // Focus (distinct repos)
        const repos = new Set<string>();
        for (const item of weekItems) {
          const meta = item.metadata as any;
          if (meta?.repo) repos.add(meta.repo);
        }
        focusTrend.push({ week: weekLabel, repos: repos.size });
      }

      // Work type breakdown
      const commits = myItems.filter((i) => i.activity_type === "commit");
      const workTypes: Record<string, number> = {};
      for (const c of commits) {
        const meta = c.metadata as any;
        const wt = meta?.work_type || "unclassified";
        workTypes[wt] = (workTypes[wt] || 0) + 1;
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

      // Focus insight
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

      // Net lines insight
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
