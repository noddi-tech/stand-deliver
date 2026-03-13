import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PartyPopper, HelpCircle, ShieldAlert, Trophy, TrendingUp, TrendingDown, Minus, Clock, GitPullRequest, Eye } from "lucide-react";
import { useUserTeam, useWeeklyDigests, useAnalyticsMetrics } from "@/hooks/useAnalytics";
import { useWeeklyAwards } from "@/hooks/useWeeklyAwards";

function TrendIcon({ direction, inverted }: { direction?: string; inverted?: boolean }) {
  if (!direction || direction === "flat") return <Minus className="h-3 w-3 text-muted-foreground" />;
  const isGood = inverted ? direction === "down" : direction === "up";
  if (direction === "up") return <TrendingUp className={`h-3 w-3 ${isGood ? "text-emerald-500" : "text-destructive"}`} />;
  return <TrendingDown className={`h-3 w-3 ${isGood ? "text-emerald-500" : "text-destructive"}`} />;
}

export default function TeamInsights() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const isLead = teamData?.role === "lead";
  const { data: digests, isLoading: digestLoading } = useWeeklyDigests(teamId);
  const { data: metrics, isLoading: metricsLoading } = useAnalyticsMetrics(teamId);
  const { data: awardsData, isLoading: awardsLoading } = useWeeklyAwards(teamId);
  const loading = teamLoading || digestLoading || metricsLoading;

  if (!teamLoading && !isLead) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-foreground mb-1">Team Leads Only</h2>
            <p className="text-sm text-muted-foreground">This page is available to team leads. Contact your team lead for insights.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latestDigest = digests?.[0];
  const awards = awardsData?.awards || [];
  const dora = awardsData?.doraMetrics;

  // Derive celebrations & concerns from metrics
  const celebrations: string[] = [];
  const concerns: string[] = [];

  if (metrics) {
    if (metrics.completionRate >= 80) celebrations.push(`Great completion rate at ${metrics.completionRate}% — keep it up!`);
    if (metrics.activeBlockers === 0) celebrations.push("Zero active blockers this period!");
    if (metrics.carryRate <= 10) celebrations.push("Minimal carry-over — team is closing work efficiently.");

    if (metrics.carryRate > 30) concerns.push(`Is the team overcommitting? Carry-over rate is ${metrics.carryRate}%.`);
    if (metrics.activeBlockers >= 3) concerns.push(`${metrics.activeBlockers} active blockers — should we prioritize unblocking?`);
    if (metrics.completionRate < 50) concerns.push(`Completion rate is ${metrics.completionRate}%. Are commitments too large?`);
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team Insights</h1>
        <p className="text-sm text-muted-foreground">Weekly team-level observations — no individual rankings</p>
      </div>

      {/* Weekly Awards */}
      {!awardsLoading && awards.length > 0 && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              This Week's Awards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {awards.map((award, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                <span className="text-2xl">{award.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{award.title}</p>
                    <Badge variant="outline" className="text-xs">{award.memberName}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{award.description}</p>
                  <p className="text-xs font-medium text-primary mt-1">{award.stat}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Team Momentum (DORA) */}
      {dora && (dora.avgPRCycleTime !== null || dora.prMergeRate > 0 || dora.reviewTurnaround !== null) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-muted-foreground" />
              Team Momentum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={dora.weekOverWeekTrends.cycleTime} inverted />
                </div>
                <p className="text-xl font-bold text-foreground">
                  {dora.avgPRCycleTime !== null ? `${dora.avgPRCycleTime}h` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg PR Cycle Time</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={dora.weekOverWeekTrends.mergeRate} />
                </div>
                <p className="text-xl font-bold text-foreground">{dora.prMergeRate}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">PRs Merged</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <TrendIcon direction={dora.weekOverWeekTrends.reviews} />
                </div>
                <p className="text-xl font-bold text-foreground">
                  {dora.reviewTurnaround !== null ? `${dora.reviewTurnaround}h` : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Review Turnaround</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest Digest */}
      {loading ? (
        <Card><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      ) : latestDigest ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Weekly Digest
              <Badge variant="secondary" className="text-xs font-normal">{latestDigest.week_start} → {latestDigest.week_end}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {latestDigest.ai_narrative && (
              <p className="text-sm text-foreground leading-relaxed">{latestDigest.ai_narrative}</p>
            )}
            {latestDigest.ai_recommendations && Array.isArray(latestDigest.ai_recommendations) && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Recommendations</h4>
                <ul className="space-y-1">
                  {(latestDigest.ai_recommendations as any[]).map((r, i) => (
                    <li key={i} className="text-sm text-foreground">• {typeof r === 'string' ? r : (r as any)?.title ? `${(r as any).title}: ${(r as any).description}` : JSON.stringify(r)}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No weekly digests yet. They will appear here once generated.</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Celebrations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PartyPopper className="h-4 w-4" /> Celebrations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-20 w-full" /> : celebrations.length > 0 ? (
              <ul className="space-y-2">
                {celebrations.map((c, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-emerald-500">🎉</span> {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Keep going — celebrations will appear as the team ships!</p>
            )}
          </CardContent>
        </Card>

        {/* Concerns */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> Worth Discussing
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-20 w-full" /> : concerns.length > 0 ? (
              <ul className="space-y-2">
                {concerns.map((c, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-amber-500">❓</span> {c}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No concerns at the moment — things look healthy!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
