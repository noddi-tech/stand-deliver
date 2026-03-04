import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface TeamMemberStatus {
  id: string;
  role: string;
  fullName: string | null;
  avatarUrl: string | null;
  openCommitments: number;
  submissionStatus: "submitted" | "pending" | "no_session";
  lastMood: string | null;
}

export function useTeamMembersStatus(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-members-status", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const [membersRes, sessionRes, commitmentsRes, responsesRes] = await Promise.all([
        supabase
          .from("team_members")
          .select("id, role, user_id, profile:profiles!inner(full_name, avatar_url)")
          .eq("team_id", teamId!)
          .eq("is_active", true),
        supabase
          .from("standup_sessions")
          .select("id")
          .eq("team_id", teamId!)
          .eq("session_date", today)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("commitments")
          .select("id, member_id, status")
          .eq("team_id", teamId!)
          .in("status", ["active", "carried", "in_progress", "blocked"]),
        supabase
          .from("standup_responses")
          .select("member_id, mood, submitted_at, session:standup_sessions!inner(team_id)")
          .eq("session.team_id", teamId!)
          .order("submitted_at", { ascending: false }),
      ]);

      const members = membersRes.data || [];
      const todaySession = sessionRes.data;
      const allCommitments = commitmentsRes.data || [];
      const allResponses = responsesRes.data || [];

      // Get today's responses if session exists
      let todayResponses: Set<string> = new Set();
      if (todaySession) {
        const { data: todayResps } = await supabase
          .from("standup_responses")
          .select("member_id")
          .eq("session_id", todaySession.id);
        todayResponses = new Set((todayResps || []).map((r) => r.member_id));
      }

      const result: TeamMemberStatus[] = members.map((m: any) => {
        const openCount = allCommitments.filter((c) => c.member_id === m.id).length;
        const latestResponse = allResponses.find((r) => r.member_id === m.id);

        let submissionStatus: TeamMemberStatus["submissionStatus"] = "no_session";
        if (todaySession) {
          submissionStatus = todayResponses.has(m.id) ? "submitted" : "pending";
        }

        return {
          id: m.id,
          role: m.role,
          fullName: m.profile?.full_name || null,
          avatarUrl: m.profile?.avatar_url || null,
          openCommitments: openCount,
          submissionStatus,
          lastMood: latestResponse?.mood || null,
        };
      });

      return result;
    },
  });
}
