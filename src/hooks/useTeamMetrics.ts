import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, startOfDay } from "date-fns";

export function useTeamMetrics(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-metrics", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const fourteenDaysAgo = subDays(new Date(), 14).toISOString();
      const today = format(new Date(), "yyyy-MM-dd");

      const [commitments, blockers, sessions, responses] = await Promise.all([
        supabase
          .from("commitments")
          .select("id, status, carry_count, created_at, resolved_at")
          .eq("team_id", teamId!)
          .gte("created_at", fourteenDaysAgo),
        supabase
          .from("blockers")
          .select("id, is_resolved, created_at, days_open")
          .eq("team_id", teamId!)
          .gte("created_at", fourteenDaysAgo),
        supabase
          .from("standup_sessions")
          .select("id, session_date")
          .eq("team_id", teamId!)
          .gte("session_date", format(subDays(new Date(), 14), "yyyy-MM-dd")),
        supabase
          .from("standup_responses")
          .select("id, session_id, submitted_at, session:standup_sessions!inner(team_id, session_date)")
          .eq("session.team_id", teamId!)
          .gte("session.session_date", format(subDays(new Date(), 14), "yyyy-MM-dd")),
      ]);

      const allCommitments = commitments.data || [];
      const allBlockers = blockers.data || [];
      const allSessions = sessions.data || [];
      const allResponses = responses.data || [];

      // Completion rate
      const total = allCommitments.length;
      const done = allCommitments.filter((c) => c.status === "done").length;
      const completionRate = total > 0 ? done / total : 0;

      // Blocker resolution rate
      const totalBlockers = allBlockers.length;
      const resolvedBlockers = allBlockers.filter((b) => b.is_resolved).length;
      const blockerResolutionRate = totalBlockers > 0 ? resolvedBlockers / totalBlockers : 1;

      // Carry-over rate
      const carried = allCommitments.filter((c) => c.carry_count >= 1).length;
      const carryRate = total > 0 ? carried / total : 0;

      // Participation rate
      const totalSessions = allSessions.length;
      const sessionsWithResponses = new Set(allResponses.map((r) => r.session_id)).size;
      const participationRate = totalSessions > 0 ? sessionsWithResponses / totalSessions : 0;

      // Health score
      const healthScore = Math.round(
        Math.min(100, Math.max(0,
          (completionRate * 0.4 + blockerResolutionRate * 0.25 + (1 - carryRate) * 0.2 + participationRate * 0.15) * 100
        ))
      );

      // Active blockers
      const activeBlockers = allBlockers.filter((b) => !b.is_resolved);
      const hasOldBlockers = activeBlockers.some(
        (b) => new Date(b.created_at) < subDays(new Date(), 2)
      );

      // Daily sparkline (14 points)
      const sparkline: { day: string; rate: number }[] = [];
      for (let d = 13; d >= 0; d--) {
        const day = subDays(new Date(), d);
        const dayStr = format(day, "yyyy-MM-dd");
        const dayStart = startOfDay(day);
        const dayEnd = new Date(dayStart.getTime() + 86400000);
        const dayCommits = allCommitments.filter((c) => {
          const created = new Date(c.created_at);
          return created >= dayStart && created < dayEnd;
        });
        const dayDone = dayCommits.filter((c) => c.status === "done").length;
        sparkline.push({
          day: format(day, "MMM d"),
          rate: dayCommits.length > 0 ? Math.round((dayDone / dayCommits.length) * 100) : 0,
        });
      }

      return {
        healthScore,
        completionRate: Math.round(completionRate * 100),
        activeBlockersCount: activeBlockers.length,
        hasOldBlockers,
        carryRate: Math.round(carryRate * 100),
        sparkline,
      };
    },
  });
}

export function useTodaySession(teamId: string | undefined, memberId: string | undefined) {
  return useQuery({
    queryKey: ["today-session", teamId, memberId],
    enabled: !!teamId && !!memberId,
    staleTime: 30000,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const { data: session } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId!)
        .eq("session_date", today)
        .limit(1)
        .maybeSingle();

      if (!session) return { status: "no_session" as const };

      const { data: response } = await supabase
        .from("standup_responses")
        .select("id, yesterday_text")
        .eq("session_id", session.id)
        .eq("member_id", memberId!)
        .limit(1)
        .maybeSingle();

      if (!response) return { status: "pending" as const, sessionId: session.id };
      
      const isSkipped = response.yesterday_text === "Skipped" && response.mood === null;
      return isSkipped
        ? { status: "skipped" as const, sessionId: session.id }
        : { status: "submitted" as const, sessionId: session.id };
    },
  });
}
