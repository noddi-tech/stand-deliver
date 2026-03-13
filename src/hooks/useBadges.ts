import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: string;
}

export interface MemberBadge {
  id: string;
  member_id: string;
  badge_id: string;
  earned_at: string;
  metadata: Record<string, any>;
  badge?: BadgeDefinition;
}

export function useBadgeDefinitions() {
  return useQuery({
    queryKey: ["badge-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badge_definitions")
        .select("*");
      if (error) throw error;
      return (data || []) as BadgeDefinition[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour - definitions rarely change
  });
}

export function useTeamBadges(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-badges", teamId],
    enabled: !!teamId,
    refetchInterval: 60_000, // auto-refresh every 60s
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_badges")
        .select("*")
        .eq("team_id", teamId!)
        .order("earned_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as MemberBadge[];
    },
  });
}

export function useMemberBadges(memberId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ["member-badges", memberId, teamId],
    enabled: !!memberId && !!teamId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_badges")
        .select("*")
        .eq("member_id", memberId!)
        .eq("team_id", teamId!)
        .order("earned_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as MemberBadge[];
    },
  });
}

/** Map badge_id to definition for quick lookup */
export function useBadgeLookup() {
  const { data: defs } = useBadgeDefinitions();
  const lookup: Record<string, BadgeDefinition> = {};
  for (const d of defs || []) {
    lookup[d.id] = d;
  }
  return lookup;
}
