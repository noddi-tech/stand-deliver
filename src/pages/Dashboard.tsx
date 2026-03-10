import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserTeam } from "@/hooks/useAnalytics";
import { useTeamMetrics, useTodaySession } from "@/hooks/useTeamMetrics";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { useTeamMembersStatus } from "@/hooks/useTeamMembers";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { useSkipStandup } from "@/hooks/useSkipStandup";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MetricCard from "@/components/analytics/MetricCard";
import HealthGauge from "@/components/analytics/HealthGauge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, ArrowRight, Users, SkipForward, GitBranch, ExternalLink } from "lucide-react";

const MOOD_EMOJI: Record<string, string> = {
  great: "🚀",
  good: "👍",
  okay: "😐",
  struggling: "😓",
  rough: "😰",
};

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

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: team, isLoading: teamLoading } = useUserTeam();
  const teamId = team?.team_id;
  const memberId = team?.id;

  const { data: metrics, isLoading: metricsLoading } = useTeamMetrics(teamId);
  const { data: todaySession } = useTodaySession(teamId, memberId);
  const { data: attention, isLoading: attentionLoading } = useAttentionItems(teamId);
  const { data: members, isLoading: membersLoading } = useTeamMembersStatus(teamId);
  const { data: activity, isLoading: activityLoading } = useRecentActivity(teamId);
  const skipMutation = useSkipStandup();

  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const handleSkip = () => {
    if (memberId && teamId) {
      skipMutation.mutate({ memberId, teamId });
    }
  };

  const standupButton = () => {
    if (!todaySession || todaySession.status === "no_session") {
      return (
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/standup")} size="sm">
            Start Today's Standup
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button onClick={handleSkip} size="sm" variant="outline" disabled={skipMutation.isPending}>
            <SkipForward className="mr-1 h-4 w-4" />
            Skip
          </Button>
        </div>
      );
    }
    if (todaySession.status === "pending") {
      return (
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate("/standup")} size="sm" variant="outline">
            Complete Your Standup
            <Clock className="ml-1 h-4 w-4" />
          </Button>
          <Button onClick={handleSkip} size="sm" variant="ghost" disabled={skipMutation.isPending}>
            <SkipForward className="mr-1 h-4 w-4" />
            Skip
          </Button>
        </div>
      );
    }
    if (todaySession.status === "skipped") {
      return (
        <Button onClick={() => navigate("/standup")} size="sm" variant="ghost">
          <SkipForward className="mr-1 h-4 w-4 text-muted-foreground" />
          Skipped Today
        </Button>
      );
    }
    return (
      <Button onClick={() => navigate("/standup")} size="sm" variant="ghost">
        <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-500" />
        View Today's Standup
      </Button>
    );
  };

  const filteredActivity = activity?.filter(
    (a) => sourceFilter === "all" || a.source === sourceFilter
  );

  const loading = teamLoading || metricsLoading;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back, {user?.user_metadata?.full_name || user?.email}
          </p>
        </div>
        {standupButton()}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Team Health" value="" loading={loading}>
          {metrics && <HealthGauge score={metrics.healthScore} size={90} />}
        </MetricCard>

        <MetricCard
          label="Completion Rate"
          value={loading ? "" : `${metrics?.completionRate ?? 0}%`}
          loading={loading}
        >
          {metrics && (
            <ResponsiveContainer width={80} height={30}>
              <LineChart data={metrics.sparkline}>
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </MetricCard>

        <MetricCard
          label="Active Blockers"
          value={loading ? "" : metrics?.activeBlockersCount ?? 0}
          loading={loading}
          icon={
            metrics?.hasOldBlockers ? (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Old
              </Badge>
            ) : undefined
          }
        />

        <MetricCard
          label="Carry-Over Rate"
          value={loading ? "" : `${metrics?.carryRate ?? 0}%`}
          loading={loading}
        />
      </div>

      {/* Needs Attention */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Needs Attention</h2>
        {attentionLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : !attention?.commitments.length && !attention?.blockers.length ? (
          <EmptyState icon={CheckCircle2} title="All clear!" description="Nothing needs attention right now 🎉" iconClassName="text-emerald-500/60" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attention?.commitments.map((c) => (
              <Card key={c.id} className="border-amber-500/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.member?.full_name || "Unknown"} · Carried {c.carry_count}x
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate("/standup")}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {attention?.blockers.map((b) => (
              <Card key={b.id} className="border-destructive/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.member?.full_name || "Unknown"} · {b.days_open} days open
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate("/standup")}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Recent Activity</h2>
          <div className="flex gap-1">
            {["all", "github", "clickup", "standup"].map((s) => (
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
        </div>
        {activityLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : !filteredActivity?.length ? (
          <EmptyState icon={GitBranch} title="No recent activity" description="Activity from GitHub, ClickUp, and standups will appear here." />
        ) : (
          <div className="space-y-1.5">
            {filteredActivity.map((a) => (
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
        )}
      </section>

      {/* Team Members */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-3">Team Members</h2>
        {membersLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : !members?.length ? (
          <EmptyState icon={Users} title="No team members" description="Invite your team to get started." actionLabel="Go to Settings" actionHref="/settings" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={m.avatarUrl || undefined} />
                    <AvatarFallback>
                      {(m.fullName || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {m.fullName || "Unknown"}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {m.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {m.openCommitments} open · {
                        m.submissionStatus === "submitted"
                          ? "✅"
                          : m.submissionStatus === "pending"
                          ? "⏳"
                          : "➖"
                      }{" "}
                      {m.lastMood ? MOOD_EMOJI[m.lastMood] || "" : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
