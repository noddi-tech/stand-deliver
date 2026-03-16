import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, differenceInCalendarDays } from "date-fns";

interface AttentionCommitment {
  id: string;
  title: string;
  carry_count: number;
  status: string;
  member: { full_name: string | null; avatar_url: string | null } | null;
}

interface AttentionBlocker {
  id: string;
  description: string;
  created_at: string;
  days_open: number;
  member: { full_name: string | null; avatar_url: string | null } | null;
}

export interface AttentionMember {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  daysSince?: number;
}

export function useAttentionItems(teamId: string | undefined) {
  return useQuery({
    queryKey: ["attention-items", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");

      const [carryOvers, oldBlockers, membersRes, sessionRes] = await Promise.all([
        supabase
          .from("commitments")
          .select("id, title, carry_count, status, member:team_members!inner(profile:profiles!inner(full_name, avatar_url))")
          .eq("team_id", teamId!)
          .gte("carry_count", 2)
          .in("status", ["active", "carried", "in_progress"]),
        supabase
          .from("blockers")
          .select("id, description, created_at, days_open, member:team_members!inner(profile:profiles!inner(full_name, avatar_url))")
          .eq("team_id", teamId!)
          .eq("is_resolved", false)
          .lt("created_at", subDays(new Date(), 2).toISOString()),
        supabase
          .from("team_members")
          .select("id, profile:profiles!inner(full_name, avatar_url)")
          .eq("team_id", teamId!)
          .eq("is_active", true),
        supabase
          .from("standup_sessions")
          .select("id")
          .eq("team_id", teamId!)
          .eq("session_date", today)
          .limit(1)
          .maybeSingle(),
      ]);

      const commitments: AttentionCommitment[] = (carryOvers.data || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        carry_count: c.carry_count,
        status: c.status,
        member: c.member?.profile || null,
      }));

      const blockers: AttentionBlocker[] = (oldBlockers.data || []).map((b: any) => ({
        id: b.id,
        description: b.description,
        created_at: b.created_at,
        days_open: b.days_open,
        member: b.member?.profile || null,
      }));

      const allMembers = (membersRes.data || []) as any[];

      // Missing standups today
      let missingStandups: AttentionMember[] = [];
      if (sessionRes.data) {
        const { data: todayResps } = await supabase
          .from("standup_responses")
          .select("member_id")
          .eq("session_id", sessionRes.data.id);
        const submittedSet = new Set((todayResps || []).map((r) => r.member_id));
        missingStandups = allMembers
          .filter((m) => !submittedSet.has(m.id))
          .map((m) => ({
            id: m.id,
            fullName: m.profile?.full_name || null,
            avatarUrl: m.profile?.avatar_url || null,
          }));
      }

      // Stale members (no standup in 3+ days)
      const { data: latestResponses } = await supabase
        .from("standup_responses")
        .select("member_id, submitted_at")
        .in("member_id", allMembers.map((m) => m.id))
        .order("submitted_at", { ascending: false });

      const latestByMember = new Map<string, string>();
      for (const r of latestResponses || []) {
        if (!latestByMember.has(r.member_id)) {
          latestByMember.set(r.member_id, r.submitted_at);
        }
      }

      // Deduplicate: exclude members already in missingStandups from staleMembers
      const missingSet = new Set(missingStandups.map((m) => m.id));

      const staleMembers: AttentionMember[] = allMembers
        .filter((m) => {
          if (missingSet.has(m.id)) return false; // already shown as missing today
          const last = latestByMember.get(m.id);
          if (!last) return true; // never submitted
          return differenceInCalendarDays(new Date(), new Date(last)) >= 3;
        })
        .map((m) => {
          const last = latestByMember.get(m.id);
          return {
            id: m.id,
            fullName: m.profile?.full_name || null,
            avatarUrl: m.profile?.avatar_url || null,
            daysSince: last ? differenceInCalendarDays(new Date(), new Date(last)) : undefined,
          };
        });

      return { commitments, blockers, missingStandups, staleMembers };
    },
  });
}
