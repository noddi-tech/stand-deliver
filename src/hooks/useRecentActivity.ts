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
}

export function useRecentActivity(teamId: string | undefined) {
  return useQuery({
    queryKey: ["recent-activity", teamId],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      const [extRes, respRes] = await Promise.all([
        supabase
          .from("external_activity")
          .select("id, source, activity_type, title, member_id, occurred_at, external_url, member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url))")
          .eq("team_id", teamId!)
          .gte("occurred_at", sevenDaysAgo)
          .order("occurred_at", { ascending: false })
          .limit(30),
        supabase
          .from("standup_responses")
          .select("id, member_id, submitted_at, mood, member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url)), session:standup_sessions!inner(team_id)")
          .eq("session.team_id", teamId!)
          .gte("submitted_at", sevenDaysAgo)
          .order("submitted_at", { ascending: false })
          .limit(20),
      ]);

      const items: ActivityItem[] = [];

      for (const e of extRes.data || []) {
        const m = e.member as any;
        items.push({
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
        });
      }

      for (const r of respRes.data || []) {
        const m = r.member as any;
        const moodEmoji: Record<string, string> = { great: "🚀", good: "👍", okay: "😐", struggling: "😓", rough: "😰" };
        items.push({
          id: r.id,
          type: "standup",
          source: "standup",
          activityType: "standup_submitted",
          title: `Submitted standup ${r.mood ? moodEmoji[r.mood] || "" : ""}`,
          memberName: m?.profile?.full_name || null,
          memberAvatar: m?.profile?.avatar_url || null,
          memberId: r.member_id,
          timestamp: r.submitted_at,
        });
      }

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return items.slice(0, 25);
    },
  });
}
