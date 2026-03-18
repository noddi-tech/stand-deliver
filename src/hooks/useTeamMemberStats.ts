import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MemberStat } from "@/hooks/useTeamSummary";

/** Paginated fetch to bypass Supabase 1000-row default limit */
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => ReturnType<typeof supabase.from<any>["select"]>,
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

/**
 * Period-aware member stats computed directly from DB tables.
 * Replaces the AI-generated memberStats for the MemberBreakdown component.
 */
export function useTeamMemberStats(teamId: string | undefined, periodDays: number) {
  return useQuery({
    queryKey: ["team-member-stats", teamId, periodDays],
    enabled: !!teamId,
    staleTime: 30_000,
    queryFn: async (): Promise<MemberStat[]> => {
      const since = new Date();
      since.setDate(since.getDate() - periodDays);
      const sinceISO = since.toISOString();

      // 1. Get all active team members with profiles
      const { data: members } = await supabase
        .from("team_members")
        .select("id, role, user_id, profiles:user_id(full_name)")
        .eq("team_id", teamId!)
        .eq("is_active", true);

      if (!members?.length) return [];

      const memberIds = members.map((m) => m.id);

      // 2. Fetch commitments in period
      const { data: commitments } = await supabase
        .from("commitments")
        .select("id, member_id, status, carry_count")
        .eq("team_id", teamId!)
        .in("member_id", memberIds)
        .gte("created_at", sinceISO);

      // 3. Fetch blockers (open)
      const { data: blockers } = await supabase
        .from("blockers")
        .select("id, member_id")
        .eq("team_id", teamId!)
        .eq("is_resolved", false)
        .in("member_id", memberIds);

      // 4. Fetch standup sessions + responses in period
      const { data: sessions } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId!)
        .gte("session_date", sinceISO.slice(0, 10));

      const sessionIds = sessions?.map((s) => s.id) ?? [];
      const totalSessions = sessionIds.length;

      let responses: { member_id: string; session_id: string }[] = [];
      if (sessionIds.length > 0) {
        const { data } = await supabase
          .from("standup_responses")
          .select("member_id, session_id")
          .in("session_id", sessionIds)
          .in("member_id", memberIds);
        responses = data ?? [];
      }

      // 5. Fetch external activity in period — PAGINATED to avoid 1000-row cap
      const activity = await fetchAllRows<{ id: string; member_id: string; source: string; activity_type: string }>(
        (from, to) =>
          supabase
            .from("external_activity")
            .select("id, member_id, source, activity_type")
            .eq("team_id", teamId!)
            .in("member_id", memberIds)
            .gte("occurred_at", sinceISO)
            .range(from, to),
      );

      // 6. Aggregate per member
      return members.map((m) => {
        const profile = m.profiles as unknown as { full_name: string | null } | null;
        const name = profile?.full_name || "Unknown";

        // Commitments
        const memberCommitments = commitments?.filter((c) => c.member_id === m.id) ?? [];
        const total = memberCommitments.length;
        const done = memberCommitments.filter((c) => c.status === "done").length;
        const carried = memberCommitments.filter((c) => c.status === "carried").length;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

        // Blockers
        const activeBlockers = blockers?.filter((b) => b.member_id === m.id).length ?? 0;

        // Standup participation
        const memberResponses = responses.filter((r) => r.member_id === m.id);
        const uniqueSessions = new Set(memberResponses.map((r) => r.session_id)).size;
        const participationRate = totalSessions > 0 ? Math.round((uniqueSessions / totalSessions) * 100) : 0;

        // External activity
        const memberActivity = activity.filter((a) => a.member_id === m.id);
        const githubCommits = memberActivity.filter((a) => a.source === "github" && a.activity_type === "commit").length;
        const prs = memberActivity.filter((a) => a.source === "github" && (a.activity_type === "pr_opened" || a.activity_type === "pr_merged")).length;
        const clickupTasks = memberActivity.filter((a) => a.source === "clickup").length;

        return {
          name,
          role: m.role,
          commitments: { total, done, carried, completionRate },
          activeBlockers,
          standup: {
            submitted: uniqueSessions,
            skipped: Math.max(0, totalSessions - uniqueSessions),
            participationRate,
            totalSessions,
          },
          externalActivity: { githubCommits, prs, clickupTasks },
        } satisfies MemberStat;
      });
    },
  });
}
