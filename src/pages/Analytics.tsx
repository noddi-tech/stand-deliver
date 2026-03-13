
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertTriangle, ArrowDownRight, TrendingUp, BarChart3, Sparkles, Loader2, RefreshCw, GitPullRequest, Clock, Eye } from "lucide-react";
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
import { MemberBreakdown } from "@/components/team/MemberBreakdown";


const WORK_TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  bugfix: "Bug Fix",
  refactor: "Refactor",
  chore: "Chore",
  infra: "Infra",
};

export default function Analytics() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const { data: metrics, isLoading } = useAnalyticsMetrics(teamId);
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useTeamSummary(teamId);
  const { data: enriched, isLoading: enrichedLoading } = useEnrichedTeamMetrics(teamId);
  const { data: teamBadges } = useTeamBadges(teamId);
  const badgeLookup = useBadgeLookup();
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

      {/* Engineering Metrics (new enriched row) */}
      {enriched && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Avg PR Cycle Time"
            value={enriched.teamAvgCycleTime !== null ? `${enriched.teamAvgCycleTime}h` : "—"}
            loading={enrichedLoading}
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Avg Review Turnaround"
            value={enriched.teamAvgReviewVelocity !== null ? `${enriched.teamAvgReviewVelocity}h` : "—"}
            loading={enrichedLoading}
            icon={<Eye className="h-4 w-4 text-muted-foreground" />}
          />
          <MetricCard
            label="Reviews Given (30d)"
            value={`${enriched.teamTotalReviews}`}
            loading={enrichedLoading}
            icon={<GitPullRequest className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      )}

      {/* Member Breakdown */}
      <MemberBreakdown
        memberStats={memberStats}
        highlights={analysis?.memberHighlights}
        teamBadges={teamBadges}
        badgeLookup={badgeLookup}
        enrichedMembers={enriched?.members}
        loading={summaryLoading}
      />

      
      {enriched && (enriched.prCycleTimeTrend.some(w => w.avgHours > 0) || enriched.teamTotalReviews > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><GitPullRequest className="h-4 w-4 text-muted-foreground" /> PR Cycle Time</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-muted-foreground" /> Code Impact</CardTitle></CardHeader>
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

      {/* Work Distribution — use AI-classified data if available, else fallback */}
      <Card>
        <CardHeader><CardTitle className="text-base">Work Distribution</CardTitle></CardHeader>
        <CardContent>
          {loading && enrichedLoading ? <Skeleton className="h-64 w-full" /> : enriched && enriched.workTypeDist.some(w => w.feature + w.bugfix + w.refactor + w.chore + w.infra > 0) ? (
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
