import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Paginate a Supabase query to bypass the 1000-row default limit */
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

function periodLabel(days: number): string {
  if (days <= 7) return "this week";
  if (days <= 31) return "this month";
  if (days <= 92) return "this quarter";
  return "this year";
}
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id, period = "7d" } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const days = parseInt(period) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const sinceDate = since.split("T")[0];

    // Fetch all data in parallel (external_activity is paginated to bypass 1000-row limit)
    const [membersRes, commitmentsRes, blockersRes, sessionsRes, badgesRes, activity] = await Promise.all([
      supabase.from("team_members").select("id, user_id, role, profile:profiles(full_name)").eq("team_id", team_id).eq("is_active", true),
      supabase.from("commitments").select("*").eq("team_id", team_id).gte("created_at", since),
      supabase.from("blockers").select("*").eq("team_id", team_id).gte("created_at", since),
      supabase.from("standup_sessions").select("id, session_date").eq("team_id", team_id).gte("session_date", sinceDate),
      supabase.from("member_badges").select("member_id, badge_id").eq("team_id", team_id),
      fetchAllRows<any>((from, to) =>
        supabase.from("external_activity").select("*").eq("team_id", team_id).gte("occurred_at", since).range(from, to)
      ),
    ]);

    const members = membersRes.data || [];
    const commitments = commitmentsRes.data || [];
    const blockers = blockersRes.data || [];
    const sessions = sessionsRes.data || [];
    const allBadges = badgesRes.data || [];

    // Get badge definitions for names
    const { data: badgeDefs } = await supabase.from("badge_definitions").select("id, name, emoji");
    const badgeDefMap: Record<string, { name: string; emoji: string }> = {};
    for (const d of badgeDefs || []) badgeDefMap[d.id] = { name: d.name, emoji: d.emoji };

    // Get responses for these sessions
    const sessionIds = sessions.map(s => s.id);
    let responses: any[] = [];
    if (sessionIds.length > 0) {
      const { data } = await supabase.from("standup_responses").select("*").in("session_id", sessionIds);
      responses = data || [];
    }

    // Build per-member stats with deep engineering metrics
    const memberStats = members.map(m => {
      const name = (m.profile as any)?.full_name || "Unknown";
      const mCommitments = commitments.filter(c => c.member_id === m.id);
      const mBlockers = blockers.filter(b => b.member_id === m.id);
      const mResponses = responses.filter(r => r.member_id === m.id);
      const mActivity = activity.filter(a => a.member_id === m.id);
      const mBadges = allBadges.filter(b => b.member_id === m.id);

      // Standup stats
      const total = mCommitments.length;
      const done = mCommitments.filter(c => c.status === "done").length;
      const carried = mCommitments.filter(c => c.carry_count > 0).length;
      const activeBlockers = mBlockers.filter(b => !b.is_resolved).length;
      const standupCount = mResponses.length;
      const totalSessions = sessions.length;
      const participationRate = totalSessions > 0 ? Math.round((standupCount / totalSessions) * 100) : 0;

      // Mood summary
      const moods = mResponses.filter(r => r.mood).map(r => r.mood);
      const moodSummary = moods.length > 0 ? moods.join(", ") : "no mood data";

      // === Deep engineering metrics ===
      const commits = mActivity.filter(a => a.source === "github" && a.activity_type === "commit");
      const prsOpened = mActivity.filter(a => a.source === "github" && a.activity_type === "pr_opened");
      const prsMerged = mActivity.filter(a => a.source === "github" && a.activity_type === "pr_merged");
      const prReviews = mActivity.filter(a => a.source === "github" && a.activity_type === "pr_review");
      const clickupTasks = mActivity.filter(a => a.source === "clickup");

      // Total LOC (additions + deletions)
      let totalAdditions = 0, totalDeletions = 0;
      for (const c of commits) {
        const meta = c.metadata as any;
        if (typeof meta?.additions === "number") totalAdditions += meta.additions;
        if (typeof meta?.deletions === "number") totalDeletions += meta.deletions;
      }

      // Avg files per PR
      const prFileCounts = [...prsOpened, ...prsMerged]
        .map(pr => (pr.metadata as any)?.files_changed)
        .filter((f): f is number => typeof f === "number");
      const avgFilesPerPR = prFileCounts.length > 0 ? Math.round(prFileCounts.reduce((a, b) => a + b, 0) / prFileCounts.length) : 0;

      // PR cycle time (created_at -> merged_at in hours)
      const cycleTimes: number[] = [];
      for (const pr of [...prsOpened, ...prsMerged]) {
        const meta = pr.metadata as any;
        if (meta?.created_at && meta?.merged_at) {
          const hours = (new Date(meta.merged_at).getTime() - new Date(meta.created_at).getTime()) / 3600000;
          if (hours > 0) cycleTimes.push(hours);
        }
      }
      const medianCycleTimeHours = median(cycleTimes);

      // Review velocity (pr_created_at -> reviewed_at in hours)
      const reviewTimes: number[] = [];
      for (const r of prReviews) {
        const meta = r.metadata as any;
        if (meta?.pr_created_at && (meta?.reviewed_at || r.occurred_at)) {
          const hours = (new Date(meta.reviewed_at || r.occurred_at).getTime() - new Date(meta.pr_created_at).getTime()) / 3600000;
          if (hours > 0) reviewTimes.push(hours);
        }
      }
      const medianReviewVelocityHours = median(reviewTimes);

      // Work type breakdown
      const workTypes: Record<string, number> = {};
      for (const c of commits) {
        const wt = (c.metadata as any)?.work_type || "unclassified";
        workTypes[wt] = (workTypes[wt] || 0) + 1;
      }

      // PR LOC stats
      let prAdditions = 0, prDeletions = 0;
      for (const pr of [...prsOpened, ...prsMerged]) {
        const meta = pr.metadata as any;
        if (typeof meta?.additions === "number") prAdditions += meta.additions;
        if (typeof meta?.deletions === "number") prDeletions += meta.deletions;
      }

      // Badges earned
      const badgeNames = mBadges
        .map(b => badgeDefMap[b.badge_id])
        .filter(Boolean)
        .map(d => `${d!.emoji} ${d!.name}`);

      return {
        name,
        role: m.role,
        commitments: { total, done, carried, completionRate: total > 0 ? Math.round((done / total) * 100) : 0 },
        activeBlockers,
        standup: { submitted: standupCount, participationRate, totalSessions },
        moods: moodSummary,
        engineering: {
          commits: commits.length,
          prsOpened: prsOpened.length,
          prsMerged: prsMerged.length,
          reviewsGiven: prReviews.length,
          totalLOC: { additions: totalAdditions, deletions: totalDeletions, net: totalAdditions - totalDeletions },
          prLOC: { additions: prAdditions, deletions: prDeletions },
          avgFilesPerPR,
          medianPRCycleTimeHours: Math.round(medianCycleTimeHours * 10) / 10,
          medianReviewVelocityHours: Math.round(medianReviewVelocityHours * 10) / 10,
          workTypes,
          clickupTasksUpdated: clickupTasks.length,
        },
        badges: badgeNames,
      };
    });

    const label = periodLabel(days);
    const prompt = `You are a direct, insightful team performance analyst for a standup tool called StandFlow. Analyze the following team data for ${label} (${days} days) and provide honest, actionable insights.

CRITICAL RULES:
1. Engineering output (commits, PRs, LOC, reviews, PR cycle times) is the PRIMARY signal of productivity — weigh it heavily. A member with high commit/PR output is productive even if standup participation is low.
2. You MUST return exactly one highlight for every member listed below. No exceptions. Even if a member has zero activity, say something like "No standup or code activity ${label} — may need a check-in."
3. It's OK to celebrate wins explicitly ("crushing it", "strong velocity") AND flag concerns directly ("needs to step up", "going quiet").
4. Be specific with names, numbers, and engineering metrics (LOC, PR count, cycle times).
5. Always use the phrase "${label}" when referring to the time period. Never say "this week" if the period is longer.

Team data (${label}, ${days} days):
${JSON.stringify(memberStats, null, 2)}

Total sessions in period: ${sessions.length}
Total team commitments: ${commitments.length}
Total team blockers: ${blockers.length} (${blockers.filter(b => !b.is_resolved).length} unresolved)
Total members: ${members.length} — you MUST return exactly ${members.length} highlights.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You analyze team standup and engineering data. Be direct and specific. Prioritize engineering output metrics." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "team_analysis",
            description: "Return structured team analysis",
            parameters: {
              type: "object",
              properties: {
                teamSummary: { type: "string", description: "2-3 sentence team-level narrative summary highlighting both standup and engineering metrics" },
                memberHighlights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      sentiment: { type: "string", enum: ["strong", "steady", "needs_attention"] },
                      highlight: { type: "string", description: "1-2 sentence specific highlight referencing engineering metrics (commits, PRs, LOC, review speed)" },
                    },
                    required: ["name", "sentiment", "highlight"],
                    additionalProperties: false,
                  },
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-3 actionable recommendations for the team lead",
                },
              },
              required: ["teamSummary", "memberHighlights", "recommendations"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "team_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();

      if (status === 402 || status === 429) {
        const isCredits = status === 402;
        const fallbackHighlights = memberStats.map((ms) => {
          const totalEng = ms.engineering.commits + ms.engineering.prsOpened + ms.engineering.prsMerged + ms.engineering.reviewsGiven;
          return {
            name: ms.name,
            sentiment: (totalEng > 0 ? "steady" : "needs_attention") as "steady" | "needs_attention",
            highlight:
              totalEng > 0
                ? `${ms.engineering.commits} commits, ${ms.engineering.prsOpened + ms.engineering.prsMerged} PRs, ${ms.engineering.reviewsGiven} reviews in this period.`
                : "No standup or code activity this period — may need a check-in.",
          };
        });

        const fallbackAnalysis = {
          teamSummary: isCredits
            ? "AI team summary is temporarily unavailable because AI credits are exhausted."
            : "AI team summary is temporarily unavailable due to rate limiting.",
          memberHighlights: fallbackHighlights,
          recommendations: [
            isCredits
              ? "Add credits in Settings → Workspace → Usage, then refresh."
              : "Wait a minute and refresh to retry summary generation.",
          ],
        };

        return new Response(
          JSON.stringify({
            analysis: fallbackAnalysis,
            memberStats,
            degraded: {
              reason: isCredits ? "credits_exhausted" : "rate_limited",
              status,
            },
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.error("AI gateway error:", status, text);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let analysis;
    if (toolCall?.function?.arguments) {
      analysis = JSON.parse(toolCall.function.arguments);
    } else {
      analysis = {
        teamSummary: aiData.choices?.[0]?.message?.content || "Unable to generate summary.",
        memberHighlights: [],
        recommendations: [],
      };
    }

    // Ensure every member has a highlight (fallback for AI misses)
    const highlightedNames = new Set(
      (analysis.memberHighlights || []).map((h: any) => h.name?.toLowerCase())
    );
    for (const ms of memberStats) {
      if (!highlightedNames.has(ms.name.toLowerCase())) {
        const totalEng = ms.engineering.commits + ms.engineering.prsOpened + ms.engineering.prsMerged + ms.engineering.reviewsGiven;
        const highlight = totalEng > 0
          ? `${ms.engineering.commits} commits, ${ms.engineering.prsOpened + ms.engineering.prsMerged} PRs — active in code but didn't get an AI highlight.`
          : "No standup or code activity this period — may need a check-in.";
        analysis.memberHighlights.push({
          name: ms.name,
          sentiment: totalEng > 0 ? "steady" : "needs_attention",
          highlight,
        });
      }
    }

    return new Response(JSON.stringify({ analysis, memberStats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-team-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
