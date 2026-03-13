import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { format, subDays, startOfWeek, isToday, isYesterday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, CheckCircle2, Target, AlertCircle, PenSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTeamBadges, useBadgeLookup } from "@/hooks/useBadges";
import { MemberBadgeIcons } from "@/components/badges/MemberBadgeIcons";

const moodEmoji: Record<string, string> = {
  great: "🚀",
  good: "👍",
  okay: "😐",
  struggling: "😓",
  rough: "😰",
};

type DateFilter = "today" | "week" | "all";

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

function parseTextToList(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}

export default function TeamFeed() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;

  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const { data: teamBadges } = useTeamBadges(teamId);
  const badgeLookup = useBadgeLookup();

  // Fetch team members with role
  const { data: members = [] } = useQuery({
    queryKey: ["team-members", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("id, user_id, role, profile:profiles(full_name, avatar_url)")
        .eq("team_id", teamId!)
        .eq("is_active", true);
      return data || [];
    },
  });

  // Fetch sessions + responses
  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["team-feed-sessions", teamId, dateFilter],
    enabled: !!teamId,
    queryFn: async () => {
      let query = supabase
        .from("standup_sessions")
        .select("id, session_date, ai_summary, status")
        .eq("team_id", teamId!)
        .order("session_date", { ascending: false })
        .limit(30);

      if (dateFilter === "today") {
        query = query.eq("session_date", format(new Date(), "yyyy-MM-dd"));
      } else if (dateFilter === "week") {
        query = query.gte("session_date", format(startOfWeek(new Date()), "yyyy-MM-dd"));
      }

      const { data } = await query;
      return data || [];
    },
  });

  const sessionIds = sessions.map((s) => s.id);

  const { data: responses = [] } = useQuery({
    queryKey: ["team-feed-responses", sessionIds],
    enabled: sessionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("standup_responses")
        .select("*")
        .in("session_id", sessionIds);
      return data || [];
    },
  });

  // Group by session date
  const grouped = useMemo(() => {
    return sessions.map((session) => {
      let sessionResponses = responses.filter((r) => r.session_id === session.id);
      if (memberFilter !== "all") {
        sessionResponses = sessionResponses.filter((r) => r.member_id === memberFilter);
      }
      return { session, responses: sessionResponses };
    }).filter((g) => g.responses.length > 0);
  }, [sessions, responses, memberFilter]);

  const getMember = (memberId: string) =>
    members.find((m) => m.id === memberId);

  if (teamLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!teamData) {
    return <div className="p-8 text-center text-muted-foreground">Not part of a team yet.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Team Feed</h1>
        <div className="flex gap-2">
          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All members" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Members</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {(m.profile as any)?.full_name || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={PenSquare}
          title="No standups submitted yet"
          description="Be the first to share your update!"
          actionLabel="Submit Your Standup"
          actionHref="/standup"
        />
      ) : (
        grouped.map(({ session, responses: dayResponses }) => (
          <div key={session.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {formatDateHeader(session.session_date)}
              </h2>
              <Badge variant="secondary" className="text-[10px]">
                {dayResponses.length} response{dayResponses.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {session.ai_summary && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 text-sm text-foreground/80">
                  <span className="font-medium text-primary">AI Summary:</span> {session.ai_summary}
                </CardContent>
              </Card>
            )}

            {dayResponses.map((r) => {
              const member = getMember(r.member_id);
              const profile = member?.profile as any;
              const role = member?.role;
              const initials = (profile?.full_name || "?")
                .split(" ")
                .map((w: string) => w[0])
                .join("")
                .slice(0, 2);

              const yesterdayItems = r.yesterday_text ? parseTextToList(r.yesterday_text) : [];
              const todayItems = r.today_text ? parseTextToList(r.today_text) : [];

              return (
                <Card key={r.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={profile?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm text-foreground">
                        {profile?.full_name || "Unknown"}
                      </span>
                      {role && (
                        <Badge variant={role === "lead" ? "default" : "secondary"} className="text-[10px]">
                          {role}
                        </Badge>
                      )}
                      {r.mood && (
                        <span className="text-lg" title={r.mood}>
                          {moodEmoji[r.mood] || ""}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {format(new Date(r.submitted_at), "h:mm a")}
                      </span>
                    </div>

                    {yesterdayItems.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                          <CheckCircle2 className="h-3 w-3" /> Resolved
                        </span>
                        <ul className="space-y-0.5">
                          {yesterdayItems.map((item, i) => (
                            <li key={i} className="text-sm text-foreground/80 pl-4">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {todayItems.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                          <Target className="h-3 w-3" /> Focusing on
                        </span>
                        <ul className="space-y-0.5">
                          {todayItems.map((item, i) => (
                            <li key={i} className="text-sm text-foreground/80 pl-4">• {item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.blockers_text && (
                      <div className="rounded-md bg-destructive/5 p-2">
                        <span className="text-xs font-medium text-destructive flex items-center gap-1 mb-1">
                          <AlertCircle className="h-3 w-3" /> Blockers
                        </span>
                        <p className="text-sm text-foreground/80 whitespace-pre-line pl-4">{r.blockers_text}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
