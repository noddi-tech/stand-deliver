import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { subDays, format, formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Activity as ActivityIcon, ExternalLink, GitBranch } from "lucide-react";
import type { ActivityItem } from "@/hooks/useRecentActivity";

const SOURCE_ICONS: Record<string, string> = {
  github: "🐙",
  clickup: "📋",
  standup: "📝",
};

const ACTIVITY_LABELS: Record<string, string> = {
  commit: "Commit",
  pr_opened: "PR Opened",
  pr_merged: "PR Merged",
  task_completed: "Completed",
  task_started: "In Progress",
  standup_submitted: "Standup",
};

function useActivityFeed(teamId: string | undefined, days: number, sourceFilter: string, memberFilter: string) {
  return useQuery({
    queryKey: ["activity-feed", teamId, days, sourceFilter, memberFilter],
    enabled: !!teamId,
    staleTime: 30000,
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const sinceDate = since.split("T")[0];
      const items: ActivityItem[] = [];
      const moodEmoji: Record<string, string> = { great: "🚀", good: "👍", okay: "😐", struggling: "😓", rough: "😰" };

      // Fetch external activity (skip if source is "standup")
      if (sourceFilter !== "standup") {
        let extQuery = supabase
          .from("external_activity")
          .select("id, source, activity_type, title, member_id, occurred_at, external_url, member:team_members!inner(id, user_id, profile:profiles!inner(full_name, avatar_url))")
          .eq("team_id", teamId!)
          .gte("occurred_at", since)
          .order("occurred_at", { ascending: false })
          .limit(200);
        if (sourceFilter !== "all") extQuery = extQuery.eq("source", sourceFilter);
        if (memberFilter !== "all") extQuery = extQuery.eq("member_id", memberFilter);
        const extRes = await extQuery;

        for (const e of extRes.data || []) {
          const m = e.member as any;
          items.push({
            id: e.id, type: "external", source: e.source, activityType: e.activity_type,
            title: e.title, memberName: m?.profile?.full_name || null,
            memberAvatar: m?.profile?.avatar_url || null, memberId: e.member_id,
            timestamp: e.occurred_at, externalUrl: e.external_url,
          });
        }
      }

      // Fetch standup responses (skip if source is github/clickup)
      if (sourceFilter === "all" || sourceFilter === "standup") {
        const { data: sessions } = await supabase
          .from("standup_sessions")
          .select("id")
          .eq("team_id", teamId!)
          .gte("session_date", sinceDate);

        const sessionIds = (sessions || []).map(s => s.id);
        if (sessionIds.length > 0) {
          let respQuery = supabase
            .from("standup_responses")
            .select("id, member_id, submitted_at, mood, yesterday_text, member:team_members!inner(id, user_id, profile:profiles!inner(full_name, avatar_url))")
            .in("session_id", sessionIds)
            .order("submitted_at", { ascending: false })
            .limit(100);
          if (memberFilter !== "all") respQuery = respQuery.eq("member_id", memberFilter);
          const { data: respData } = await respQuery;

          for (const r of respData || []) {
            const m = r.member as any;
            const isSkip = r.yesterday_text === "Skipped" && !r.mood;
            items.push({
              id: r.id, type: "standup", source: "standup",
              activityType: isSkip ? "standup_skipped" : "standup_submitted",
              title: isSkip ? "Skipped standup" : `Submitted standup ${r.mood ? moodEmoji[r.mood] || "" : ""}`,
              memberName: m?.profile?.full_name || null,
              memberAvatar: m?.profile?.avatar_url || null,
              memberId: r.member_id, timestamp: r.submitted_at,
            });
          }
        }
      }

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return items;
    },
  });
}

export default function Activity() {
  const { data: team, isLoading: teamLoading } = useUserTeam();
  const teamId = team?.team_id;
  const [searchParams] = useSearchParams();
  const presetMember = searchParams.get("member");

  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [memberFilter, setMemberFilter] = useState<string>(presetMember || "all");
  const [days, setDays] = useState(30);

  const { data: members } = useQuery({
    queryKey: ["team-members-list", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("id, profile:profiles(full_name)")
        .eq("team_id", teamId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: activity, isLoading } = useActivityFeed(teamId, days);

  const filtered = useMemo(() => {
    if (!activity) return [];
    return activity.filter(a => {
      if (sourceFilter !== "all" && a.source !== sourceFilter) return false;
      if (memberFilter !== "all" && a.memberId !== memberFilter) return false;
      return true;
    });
  }, [activity, sourceFilter, memberFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    for (const item of filtered) {
      const day = format(new Date(item.timestamp), "yyyy-MM-dd");
      if (!groups[day]) groups[day] = [];
      groups[day].push(item);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  // Summary counts
  const summary = useMemo(() => {
    if (!filtered) return { commits: 0, prs: 0, tasks: 0, standups: 0 };
    return {
      commits: filtered.filter(a => a.activityType === "commit").length,
      prs: filtered.filter(a => a.activityType === "pr_opened" || a.activityType === "pr_merged").length,
      tasks: filtered.filter(a => a.source === "clickup").length,
      standups: filtered.filter(a => a.source === "standup").length,
    };
  }, [filtered]);

  const loading = teamLoading || isLoading;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground">Team activity over the last {days} days</p>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Commits", value: summary.commits, icon: "🐙" },
          { label: "PRs", value: summary.prs, icon: "🔀" },
          { label: "Tasks", value: summary.tasks, icon: "📋" },
          { label: "Standups", value: summary.standups, icon: "📝" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{loading ? "—" : s.value}</p>
              <p className="text-xs text-muted-foreground">{s.icon} {s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["all", "github", "clickup", "standup"].map(s => (
            <Button
              key={s}
              size="sm"
              variant={sourceFilter === s ? "secondary" : "ghost"}
              className="text-xs h-7 px-2.5"
              onClick={() => setSourceFilter(s)}
            >
              {s === "all" ? "All" : s === "github" ? "🐙 GitHub" : s === "clickup" ? "📋 ClickUp" : "📝 Standups"}
            </Button>
          ))}
        </div>

        <Select value={memberFilter} onValueChange={setMemberFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {(members || []).map(m => (
              <SelectItem key={m.id} value={m.id}>
                {(m.profile as any)?.full_name || "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
          <SelectTrigger className="w-[120px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : !filtered.length ? (
        <EmptyState icon={GitBranch} title="No activity found" description="Try adjusting your filters or date range." />
      ) : (
        <div className="space-y-6">
          {grouped.map(([date, items]) => (
            <div key={date}>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                {format(new Date(date), "EEEE, MMM d")}
              </h3>
              <div className="space-y-1.5">
                {items.map(a => (
                  <Card key={a.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="text-lg shrink-0">{SOURCE_ICONS[a.source] || "📌"}</span>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={a.memberAvatar || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(a.memberName || "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{a.memberName || "Unknown"}</span>
                          <span>·</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {ACTIVITY_LABELS[a.activityType] || a.activityType}
                          </Badge>
                          <span>·</span>
                          <span>{formatDistanceToNow(new Date(a.timestamp), { addSuffix: true })}</span>
                        </div>
                      </div>
                      {a.externalUrl && (
                        <a href={a.externalUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
