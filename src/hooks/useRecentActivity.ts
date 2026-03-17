import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

export interface ActivityItem {
  id: string;
  type: "external" | "standup";
  source: string; // "github" | "clickup" | "standup"
  activityType: string;
  title: string;
  memberName: string | null;
  memberAvatar: string | null;
  memberId: string;
  timestamp: string;
  externalUrl?: string | null;
  badgeKey?: string;
  badgeSource?: string;
}

export function useRecentActivity(teamId: string | undefined) {
  return useQuery({
    queryKey: ["recent-activity", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      const sevenDaysAgoDate = sevenDaysAgo.split("T")[0];

      // Fetch external activity
      const extRes = await supabase
        .from("external_activity")
        .select("id, source, activity_type, title, member_id, occurred_at, external_url, member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url))")
        .eq("team_id", teamId!)
        .gte("occurred_at", sevenDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(200);

      // Two-step standup query: first get session IDs, then responses
      const { data: sessions } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId!)
        .gte("session_date", sevenDaysAgoDate);

      const sessionIds = (sessions || []).map((s) => s.id);

      let respRes: { data: any[] | null } = { data: [] };
      if (sessionIds.length > 0) {
        respRes = await supabase
          .from("standup_responses")
          .select("id, member_id, submitted_at, mood, member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url))")
          .in("session_id", sessionIds)
          .order("submitted_at", { ascending: false })
          .limit(20);
      }

      // Build items grouped by member to ensure balanced representation
      const memberItems: Record<string, ActivityItem[]> = {};

      for (const e of extRes.data || []) {
        const m = e.member as any;
        const item: ActivityItem = {
          id: e.id,
          type: "external",
          source: e.source,
          activityType: e.activity_type,
          title: e.title,
          memberName: m?.profile?.full_name || null,
          memberAvatar: m?.profile?.avatar_url || null,
          memberId: e.member_id,
          timestamp: e.occurred_at,
          externalUrl: e.external_url,
        };
        if (!memberItems[e.member_id]) memberItems[e.member_id] = [];
        memberItems[e.member_id].push(item);
      }

      for (const r of respRes.data || []) {
        const m = r.member as any;
        const moodEmoji: Record<string, string> = { great: "🚀", good: "👍", okay: "😐", struggling: "😓", rough: "😰" };
        const item: ActivityItem = {
          id: r.id,
          type: "standup",
          source: "standup",
          activityType: "standup_submitted",
          title: `Submitted standup ${r.mood ? moodEmoji[r.mood] || "" : ""}`,
          memberName: m?.profile?.full_name || null,
          memberAvatar: m?.profile?.avatar_url || null,
          memberId: r.member_id,
          timestamp: r.submitted_at,
        };
        if (!memberItems[r.member_id]) memberItems[r.member_id] = [];
        memberItems[r.member_id].push(item);
      }

      // Balanced merge: take up to 8 items per member, then fill remaining slots
      const MAX_PER_MEMBER_INITIAL = 8;
      const MAX_TOTAL = 30;
      const members = Object.keys(memberItems);
      const selected: ActivityItem[] = [];

      // First pass: take up to MAX_PER_MEMBER_INITIAL from each member
      for (const mid of members) {
        const sorted = memberItems[mid].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        selected.push(...sorted.slice(0, MAX_PER_MEMBER_INITIAL));
      }

      // Sort by timestamp and cap
      selected.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return selected.slice(0, MAX_TOTAL);
    },
  });
}
