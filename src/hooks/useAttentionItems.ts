import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

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

export function useAttentionItems(teamId: string | undefined) {
  return useQuery({
    queryKey: ["attention-items", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const [carryOvers, oldBlockers] = await Promise.all([
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

      return { commitments, blockers };
    },
  });
}
