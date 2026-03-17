import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MemberBadgeCounts = Record<string, Record<string, number>>;
export type MemberBadgeCountPct = Record<string, Record<string, number>>;
export type MemberBadgeImpactPct = Record<string, Record<string, number>>;

export function useMemberBadgeCounts(teamId?: string) {
  return useQuery({
    queryKey: ["member-badge-counts", teamId],
    enabled: !!teamId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ counts: MemberBadgeCounts; countPct: MemberBadgeCountPct; impactPct: MemberBadgeImpactPct }> => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get recent external_activity for this team
      const { data: activities } = await supabase
        .from("external_activity")
        .select("id, member_id")
        .eq("team_id", teamId!)
        .gte("occurred_at", sevenDaysAgo.toISOString());

      if (!activities?.length) return { counts: {}, countPct: {}, impactPct: {} };

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

      // Batch-fetch impact classifications
      const allImpact: Array<{ activity_id: string; impact_score: number; member_id: string }> = [];
      for (let i = 0; i < activityIds.length; i += 200) {
        const batch = activityIds.slice(i, i + 200);
        const { data } = await supabase
          .from("impact_classifications")
          .select("activity_id, impact_score, member_id")
          .in("activity_id", batch);
        if (data) allImpact.push(...data);
      }

      // Build badge lookup: activityId -> badgeKey
      const badgeByActivity: Record<string, string> = {};
      for (const b of allBadges) {
        badgeByActivity[b.activity_id] = b.badge_key;
      }

      // Aggregate counts: memberId → badgeKey → count
      const counts: MemberBadgeCounts = {};
      for (const b of allBadges) {
        const memberId = memberMap[b.activity_id];
        if (!memberId) continue;
        if (!counts[memberId]) counts[memberId] = {};
        counts[memberId][b.badge_key] = (counts[memberId][b.badge_key] || 0) + 1;
      }

      // Convert counts to percentages
      const countPct: MemberBadgeCountPct = {};
      for (const [memberId, badges] of Object.entries(counts)) {
        const total = Object.values(badges).reduce((s, v) => s + v, 0);
        if (total > 0) {
          countPct[memberId] = {};
          for (const [key, val] of Object.entries(badges)) {
            countPct[memberId][key] = Math.round((val / total) * 1000) / 10;
          }
        }
      }

      // Aggregate impact-weighted: memberId → badgeKey → totalImpact
      const impactByMemberBadge: Record<string, Record<string, number>> = {};
      for (const ic of allImpact) {
        const badgeKey = badgeByActivity[ic.activity_id] || "unknown";
        const memberId = ic.member_id;
        if (!impactByMemberBadge[memberId]) impactByMemberBadge[memberId] = {};
        impactByMemberBadge[memberId][badgeKey] = (impactByMemberBadge[memberId][badgeKey] || 0) + Number(ic.impact_score);
      }

      // Convert to percentages
      const impactPct: MemberBadgeImpactPct = {};
      for (const [memberId, badges] of Object.entries(impactByMemberBadge)) {
        const total = Object.values(badges).reduce((s, v) => s + v, 0);
        if (total > 0) {
          impactPct[memberId] = {};
          for (const [key, val] of Object.entries(badges)) {
            impactPct[memberId][key] = Math.round((val / total) * 1000) / 10;
          }
        }
      }

      return { counts, impactPct };
    },
  });
}
