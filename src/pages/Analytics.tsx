
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertTriangle, ArrowDownRight, TrendingUp, BarChart3, Sparkles, Loader2, RefreshCw, GitPullRequest, Clock, Eye, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import MetricCard from "@/components/analytics/MetricCard";
import HealthGauge from "@/components/analytics/HealthGauge";
import CommitmentFunnel from "@/components/analytics/CommitmentFunnel";
import BlockerHeatmap from "@/components/analytics/BlockerHeatmap";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUserTeam, useAnalyticsMetrics } from "@/hooks/useAnalytics";
import { useTeamSummary } from "@/hooks/useTeamSummary";
import { useEnrichedTeamMetrics } from "@/hooks/useEnrichedAnalytics";
import { useTeamBadges, useBadgeLookup } from "@/hooks/useBadges";
import { useMemberBadgeCounts } from "@/hooks/useMemberBadgeCounts";
import { type BreakdownPeriod, PERIOD_DAYS } from "@/components/team/MemberBreakdown";
import { useTeamMomentum } from "@/hooks/useTeamMomentum";
import { MemberBreakdown } from "@/components/team/MemberBreakdown";
import { useTeamFocusItems, useContributionClassification } from "@/hooks/useTeamFocus";
import { FocusAlignment } from "@/components/analytics/FocusAlignment";

function TrendIcon({ direction, inverted }: { direction?: string; inverted?: boolean }) {
  if (!direction || direction === "flat") return <Minus className="h-3 w-3 text-muted-foreground" />;
  const isGood = inverted ? direction === "down" : direction === "up";
  if (direction === "up") return <TrendingUp className={`h-3 w-3 ${isGood ? "text-emerald-500" : "text-destructive"}`} />;
  return <TrendingDown className={`h-3 w-3 ${isGood ? "text-emerald-500" : "text-destructive"}`} />;
}

export default function Analytics() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const { data: metrics, isLoading } = useAnalyticsMetrics(teamId);
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useTeamSummary(teamId);
  const { data: enriched, isLoading: enrichedLoading } = useEnrichedTeamMetrics(teamId);
  const { data: momentum } = useTeamMomentum(teamId);
  const { data: teamBadges } = useTeamBadges(teamId);
  const badgeLookup = useBadgeLookup();
  const [breakdownPeriod, setBreakdownPeriod] = useState<BreakdownPeriod>("week");
  const { data: badgeData } = useMemberBadgeCounts(teamId, PERIOD_DAYS[breakdownPeriod]);
  const { data: focusItems } = useTeamFocusItems(teamId);
  const { data: classification, isLoading: classificationLoading, refetch: refetchClassification } = useContributionClassification(teamId, (focusItems?.length ?? 0) > 0);
  const loading = teamLoading || isLoading;

  const analysis = summaryData?.analysis;
  const memberStats = summaryData?.memberStats || [];

  if (!loading && !metrics) {
    return (
      <div className="bg-background p-6 md:p-8 max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2">Analytics</h1>
        <EmptyState
          icon={BarChart3}
          title="Not enough data yet"
          description="Need at least 1 week of standup data to show analytics."
          actionLabel="Start a Standup"
          actionHref="/standup"
        />
      </div>
    );
  }

  const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" };

  return (
    <div className="bg-background p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">Team performance overview</p>
      </div>

      {/* AI Summary Card */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Team Summary
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchSummary()} disabled={summaryLoading} className="h-7 text-xs">
              {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {summaryLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : analysis ? (
            <>
              <p className="text-sm text-foreground leading-relaxed">{analysis.teamSummary}</p>
              {analysis.recommendations?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</p>
                  {analysis.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Click refresh to generate an AI summary of your team's performance.</p>
          )}
        </CardContent>
      </Card>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Health Score" value="" loading={loading}>
          {metrics && <HealthGauge score={metrics.healthScore} size={100} />}
        </MetricCard>
        <MetricCard label="Completion Rate" value={loading ? "" : `${metrics?.completionRate ?? 0}%`} loading={loading} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard label="Active Blockers" value={loading ? "" : `${metrics?.activeBlockers ?? 0}`} loading={loading} icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard label="Carry-Over Rate" value={loading ? "" : `${metrics?.carryRate ?? 0}%`} loading={loading} icon={<ArrowDownRight className="h-4 w-4 text-muted-foreground" />} />
      </div>

      {/* Team Momentum (from useTeamMomentum) */}
      {momentum && (momentum.avgPRCycleTime !== null || momentum.prsMerged > 0 || momentum.reviewTurnaround !== null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-muted-foreground" />
              Team Momentum
              <Badge variant="secondary" className="text-[10px] font-normal">This week</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={momentum.weekOverWeekTrends.cycleTime} inverted />
                </div>
                <p className="text-xl font-bold text-foreground">
                  {momentum.avgPRCycleTime !== null ? `${momentum.avgPRCycleTime}h` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg PR Cycle Time</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={momentum.weekOverWeekTrends.mergeRate} />
                </div>
                <p className="text-xl font-bold text-foreground">{momentum.prsMerged}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">PRs Merged</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={momentum.weekOverWeekTrends.reviews} />
                </div>
                <p className="text-xl font-bold text-foreground">
                  {momentum.reviewTurnaround !== null ? `${momentum.reviewTurnaround}h` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Review Turnaround</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Focus Alignment */}
      <FocusAlignment
        focusItems={focusItems || []}
        classification={classification}
        classificationLoading={classificationLoading}
        onRefresh={() => refetchClassification()}
      />

      {/* Member Breakdown */}
      <MemberBreakdown
        memberStats={memberStats}
        highlights={analysis?.memberHighlights}
        teamBadges={teamBadges}
        badgeLookup={badgeLookup}
        enrichedMembers={enriched?.members}
        classification={classification}
        focusItems={focusItems}
        badgeCounts={badgeData?.counts}
        badgeCountPct={badgeData?.countPct}
        badgeImpactPct={badgeData?.impactPct}
        loading={summaryLoading}
      />
import { useState } from "react";
      {enriched && (enriched.prCycleTimeTrend.some(w => w.avgHours > 0) || enriched.teamTotalReviews > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-muted-foreground" /> PR Cycle Time
                <Badge variant="secondary" className="text-[10px] font-normal">Last 30 days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={enriched.prCycleTimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="h" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}h`, "Avg Cycle Time"]} />
                  <Line type="monotone" dataKey="avgHours" stroke="hsl(var(--chart-blue))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-blue))" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" /> VIS Impact
                <Badge variant="secondary" className="text-[10px] font-normal">Last 30 days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={enriched.codeImpactTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="impact" fill="hsl(var(--chart-emerald))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Work Distribution — from activity_badges */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Work Distribution
            <Badge variant="secondary" className="text-[10px] font-normal">Last 30 days</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && enrichedLoading ? <Skeleton className="h-64 w-full" /> : enriched && enriched.workTypeDist.some(w => (Number(w.feature) || 0) + (Number(w.bugfix) || 0) + (Number(w.refactor) || 0) + (Number(w.chore) || 0) + (Number(w.infra) || 0) > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={enriched.workTypeDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="feature" name="Feature" stackId="1" fill="hsl(var(--chart-blue))" stroke="hsl(var(--chart-blue))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="bugfix" name="Bug Fix" stackId="1" fill="hsl(var(--chart-red))" stroke="hsl(var(--chart-red))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="refactor" name="Refactor" stackId="1" fill="hsl(var(--chart-emerald))" stroke="hsl(var(--chart-emerald))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="chore" name="Chore" stackId="1" fill="hsl(var(--chart-slate))" stroke="hsl(var(--chart-slate))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="infra" name="Infra" stackId="1" fill="hsl(var(--chart-amber))" stroke="hsl(var(--chart-amber))" fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={metrics?.weeklyWork}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="Feature" stackId="1" fill="hsl(var(--chart-blue))" stroke="hsl(var(--chart-blue))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="Bug Fix" stackId="1" fill="hsl(var(--chart-red))" stroke="hsl(var(--chart-red))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="Tech Debt" stackId="1" fill="hsl(var(--chart-amber))" stroke="hsl(var(--chart-amber))" fillOpacity={0.7} />
                <Area type="monotone" dataKey="Other" stackId="1" fill="hsl(var(--chart-slate))" stroke="hsl(var(--chart-slate))" fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CommitmentFunnel data={metrics?.funnel ?? []} loading={loading} />
        <BlockerHeatmap data={metrics?.heatmap ?? { categories: [], weeks: [], values: [] }} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Participation by Day</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={metrics?.participation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="rate" fill="hsl(var(--chart-blue))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Trending Themes</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="flex flex-wrap gap-2">
                {(metrics?.themes ?? []).length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
                {(metrics?.themes ?? []).map(t => (
                  <Badge key={t.word} variant="secondary" className="text-xs">
                    {t.word} <span className="ml-1 opacity-60">({t.count})</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
