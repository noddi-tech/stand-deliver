import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, GitPullRequest, Eye, Code2, Target } from "lucide-react";
import { useUserTeam, useMyAnalytics } from "@/hooks/useAnalytics";
import { usePersonalEnrichedMetrics } from "@/hooks/useEnrichedAnalytics";
import { BadgeShowcase } from "@/components/badges/BadgeShowcase";

export default function MyAnalytics() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const memberId = teamData?.id;
  const teamId = teamData?.team_id;
  const { data, isLoading } = useMyAnalytics(memberId);
  const { data: enriched, isLoading: enrichedLoading } = usePersonalEnrichedMetrics(memberId, teamId);
  const loading = teamLoading || isLoading;

  const tooltipStyle = { backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" };

  const sentimentColors: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    neutral: "bg-primary/10 text-primary border-primary/20",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Analytics</h1>
        <p className="text-sm text-muted-foreground">Your personal performance over the last 30 days</p>
      </div>

      {/* Enriched Insight Cards */}
      {enriched && enriched.insights.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-muted-foreground" /> Data-Driven Insights
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {enriched.insights.map((ins, i) => (
              <Card key={i} className="border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{ins.title}</h3>
                    <Badge variant="outline" className={`text-[10px] ${sentimentColors[ins.sentiment]}`}>
                      {ins.sentiment}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{ins.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completion Trend */}
      <Card>
        <CardHeader><CardTitle className="text-base">Completion Rate Trend</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-56 w-full" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data?.completionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--chart-blue))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* PR Cycle Time + Reviews Given vs Received */}
      {enriched && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 text-muted-foreground" /> PR Cycle Time
              </CardTitle>
              {enriched.currentWeekAvgCycleTime !== null && enriched.fourWeekAvgCycleTime !== null && (
                <p className="text-xs text-muted-foreground">
                  This week: {enriched.currentWeekAvgCycleTime}h · 4-week avg: {enriched.fourWeekAvgCycleTime}h
                </p>
              )}
            </CardHeader>
            <CardContent>
              {enrichedLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={enriched.prCycleTimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="h" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}h`, "Avg Cycle Time"]} />
                    <Line type="monotone" dataKey="avgHours" stroke="hsl(var(--chart-blue))" strokeWidth={2} dot={{ r: 4, fill: "hsl(var(--chart-blue))" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" /> Reviews Given vs Received
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Total: {enriched.reviewsGivenTotal} given · {enriched.reviewsReceivedTotal} received
              </p>
            </CardHeader>
            <CardContent>
              {enrichedLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={enriched.reviewsGivenVsReceived}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="given" name="Given" fill="hsl(var(--chart-blue))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="received" name="Received" fill="hsl(var(--chart-emerald))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Code Impact + Focus */}
      {enriched && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="h-4 w-4 text-muted-foreground" /> Code Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              {enrichedLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={enriched.codeImpactTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, name: string) => {
                      if (name === "impact") return [v, "Impact Score"];
                      return [v, name];
                    }} />
                    <Bar dataKey="impact" name="Impact Score" fill="hsl(var(--chart-emerald))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" /> Focus Score
              </CardTitle>
              <p className="text-xs text-muted-foreground">Repos touched per week — fewer = more focused</p>
            </CardHeader>
            <CardContent>
              {enrichedLoading ? <Skeleton className="h-48 w-full" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={enriched.focusTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Repos"]} />
                    <Bar dataKey="repos" fill="hsl(var(--chart-amber))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Work Type Breakdown */}
      {enriched && enriched.workTypeBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Work Type Breakdown (AI-classified)</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {enriched.workTypeBreakdown.map((wt) => (
                <Badge key={wt.type} variant="secondary" className="text-xs capitalize">
                  {wt.type} <span className="ml-1 opacity-60">({wt.count})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mood Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Mood Trend</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data?.moodTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => {
                    const labels: Record<number, string> = { 1: "Rough", 2: "Struggling", 3: "Okay", 4: "Good", 5: "Great" };
                    return [labels[v] || v, "Mood"];
                  }} />
                  <Line type="monotone" dataKey="mood" stroke="hsl(var(--chart-emerald))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--chart-emerald))" }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Carry-over by type */}
        <Card>
          <CardHeader><CardTitle className="text-base">Carry-Over by Work Type</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data?.carryByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="hsl(var(--chart-amber))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legacy Insight Cards */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-muted-foreground" /> Your Patterns
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data?.insights.map((ins, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-1">{ins.title}</h3>
                  <p className="text-xs text-muted-foreground">{ins.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
