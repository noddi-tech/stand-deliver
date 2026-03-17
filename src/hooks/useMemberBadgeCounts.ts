import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MemberBadgeCounts = Record<string, Record<string, number>>;

export function useMemberBadgeCounts(teamId?: string) {
  return useQuery({
    queryKey: ["member-badge-counts", teamId],
    enabled: !!teamId,
    staleTime: 60_000,
    queryFn: async (): Promise<MemberBadgeCounts> => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get recent external_activity for this team
      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, member_id")
        .eq("team_id", teamId!)
        .gte("occurred_at", sevenDaysAgo.toISOString());

      if (!activities?.length) return {};

      const activityIds = activities.map((a) => a.id);
      const memberMap: Record<string, string> = {};
      for (const a of activities) {
        memberMap[a.id] = a.member_id;
      }

      // Batch-fetch badges
      const allBadges: Array<{ activity_id: string; badge_key: string }> = [];
      for (let i = 0; i < activityIds.length; i += 200) {
        const batch = activityIds.slice(i, i + 200);
        const { data } = await supabase
          .from("activity_badges")
          .select("activity_id, badge_key")
          .in("activity_id", batch);
        if (data) allBadges.push(...data);
      }

      // Aggregate: memberId → badgeKey → count
      const result: MemberBadgeCounts = {};
      for (const b of allBadges) {
        const memberId = memberMap[b.activity_id];
        if (!memberId) continue;
        if (!result[memberId]) result[memberId] = {};
        result[memberId][b.badge_key] = (result[memberId][b.badge_key] || 0) + 1;
      }

      return result;
    },
  });
}
