import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserTeam } from "@/hooks/useAnalytics";
import { useTeamMetrics, useTodaySession } from "@/hooks/useTeamMetrics";
import { useAttentionItems } from "@/hooks/useAttentionItems";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { useSkipStandup } from "@/hooks/useSkipStandup";
import { useTeamBadges, useBadgeLookup } from "@/hooks/useBadges";
import { useMemberBadgeCounts } from "@/hooks/useMemberBadgeCounts";
import { type BreakdownPeriod, PERIOD_DAYS } from "@/components/team/MemberBreakdown";
import { useTeamMomentum } from "@/hooks/useTeamMomentum";
import { MemberBreakdown } from "@/components/team/MemberBreakdown";
import { useTeamFocusItems, useContributionClassification, useReclassifyContributions, type ReclassifyMode } from "@/hooks/useTeamFocus";
import { FocusAlignment } from "@/components/analytics/FocusAlignment";
import { ActivityBadgeChip } from "@/components/activity/ActivityBadgeChip";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

import { useTeamSummary } from "@/hooks/useTeamSummary";
import { useEnrichedTeamMetrics } from "@/hooks/useEnrichedAnalytics";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import MetricCard from "@/components/analytics/MetricCard";
import HealthGauge from "@/components/analytics/HealthGauge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, ArrowRight, Users, SkipForward, GitBranch, ExternalLink, GitPullRequest, Eye, TrendingUp, TrendingDown, Minus } from "lucide-react";

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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: team, isLoading: teamLoading } = useUserTeam();
  const teamId = team?.team_id;
  const memberId = team?.id;

  const { data: metrics, isLoading: metricsLoading } = useTeamMetrics(teamId);
  const { data: todaySession } = useTodaySession(teamId, memberId);
  const { data: attention, isLoading: attentionLoading } = useAttentionItems(teamId);
  const { data: activity, isLoading: activityLoading } = useRecentActivity(teamId);
  const skipMutation = useSkipStandup();
  const { data: teamBadges } = useTeamBadges(teamId);
  const badgeLookup = useBadgeLookup();
  const [breakdownPeriod, setBreakdownPeriod] = useState<BreakdownPeriod>("week");
  const { data: badgeData } = useMemberBadgeCounts(teamId, PERIOD_DAYS[breakdownPeriod]);
  const { data: summaryData, isLoading: summaryLoading } = useTeamSummary(teamId);
  const { data: enriched } = useEnrichedTeamMetrics(teamId);
  const { data: focusItems } = useTeamFocusItems(teamId);
  const hasFocusItems = (focusItems?.length ?? 0) > 0;
  const { data: classification, isLoading: classificationLoading, refetch: refetchClassification } = useContributionClassification(teamId, hasFocusItems);
  const reclassifyMutation = useReclassifyContributions(teamId);
  const handleRefreshClassification = (mode: ReclassifyMode = "incremental") => {
    reclassifyMutation.mutate({ mode }, {
      onSuccess: () => refetchClassification(),
      onError: (err: Error) => {
        toast({ title: err.message || "Re-classification failed", variant: "destructive" });
      },
    });
  };
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  useRealtimeInvalidation(teamId);

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

  // Page-level loading skeleton
  if (teamLoading) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <Skeleton className="h-48 rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-lg" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {getGreeting()}, {user?.user_metadata?.full_name || user?.email}
          </p>
        </div>
        {standupButton()}
      </div>

      {/* Focus Alignment — only when focus items exist */}
      {hasFocusItems && (
        <section>
          <FocusAlignment
            focusItems={focusItems!}
            classification={classification}
            classificationLoading={classificationLoading || reclassifyMutation.isPending}
            onRefresh={handleRefreshClassification}
          />
        </section>
      )}

      {/* Member Breakdown (AI-powered) */}
      <section>
        <MemberBreakdown
          memberStats={summaryData?.memberStats || []}
          highlights={summaryData?.analysis?.memberHighlights}
          teamBadges={teamBadges}
          badgeLookup={badgeLookup}
          enrichedMembers={enriched?.members}
          classification={classification}
          focusItems={focusItems}
          badgeCounts={badgeData?.counts}
          badgeCountPct={badgeData?.countPct}
          badgeImpactPct={badgeData?.impactPct}
          period={breakdownPeriod}
          onPeriodChange={setBreakdownPeriod}
          loading={summaryLoading}
        />
      </section>

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
        ) : !attention?.commitments.length && !attention?.blockers.length && !attention?.missingStandups.length && !attention?.staleMembers.length ? (
          <div className="flex items-center gap-3 py-4 px-4 rounded-lg border border-dashed border-border">
            <CheckCircle2 className="h-5 w-5 text-emerald-500/60 shrink-0" />
            <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attention?.missingStandups.map((m) => (
              <Card key={`missing-${m.id}`} className="border-amber-500/50">
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.fullName || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      Hasn't submitted today's standup
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate("/standup")}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {attention?.staleMembers.map((m) => (
              <Card key={`stale-${m.id}`} className="border-muted-foreground/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.fullName || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.daysSince ? `Hasn't checked in for ${m.daysSince} days` : "Has never submitted a standup"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
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
          <h2 className="text-lg font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => navigate("/activity")}>Recent Activity →</h2>
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
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      {a.badgeKey && <ActivityBadgeChip badgeKey={a.badgeKey} />}
                    </div>
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
    </div>
  );
}
