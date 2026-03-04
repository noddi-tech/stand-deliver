import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, AlertTriangle, ArrowDownRight, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import MetricCard from "@/components/analytics/MetricCard";
import HealthGauge from "@/components/analytics/HealthGauge";
import CommitmentFunnel from "@/components/analytics/CommitmentFunnel";
import BlockerHeatmap from "@/components/analytics/BlockerHeatmap";
import { useUserTeam, useAnalyticsMetrics } from "@/hooks/useAnalytics";

export default function Analytics() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const { data: metrics, isLoading } = useAnalyticsMetrics(teamId);
  const loading = teamLoading || isLoading;

  return (
    <div className="bg-background p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground">Team performance overview</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Health Score" value="" loading={loading}>
          {metrics && <HealthGauge score={metrics.healthScore} size={100} />}
        </MetricCard>
        <MetricCard label="Completion Rate" value={loading ? "" : `${metrics?.completionRate ?? 0}%`} loading={loading} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard label="Active Blockers" value={loading ? "" : `${metrics?.activeBlockers ?? 0}`} loading={loading} icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />} />
        <MetricCard label="Carry-Over Rate" value={loading ? "" : `${metrics?.carryRate ?? 0}%`} loading={loading} icon={<ArrowDownRight className="h-4 w-4 text-muted-foreground" />} />
      </div>

      {/* Work Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-base">Work Distribution</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-64 w-full" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={metrics?.weeklyWork}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
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
        {/* Commitment Funnel */}
        <CommitmentFunnel data={metrics?.funnel ?? []} loading={loading} />

        {/* Blocker Heatmap */}
        <BlockerHeatmap data={metrics?.heatmap ?? { categories: [], weeks: [], values: [] }} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Participation */}
        <Card>
          <CardHeader><CardTitle className="text-base">Participation by Day</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={metrics?.participation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="rate" fill="hsl(var(--chart-blue))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Trending Themes */}
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
