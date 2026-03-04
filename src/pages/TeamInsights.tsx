import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PartyPopper, HelpCircle, ShieldAlert } from "lucide-react";
import { useUserTeam, useWeeklyDigests, useAnalyticsMetrics } from "@/hooks/useAnalytics";

export default function TeamInsights() {
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const teamId = teamData?.team_id;
  const isLead = teamData?.role === "lead";
  const { data: digests, isLoading: digestLoading } = useWeeklyDigests(teamId);
  const { data: metrics, isLoading: metricsLoading } = useAnalyticsMetrics(teamId);
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
                  {(latestDigest.ai_recommendations as string[]).map((r, i) => (
                    <li key={i} className="text-sm text-foreground">• {typeof r === 'string' ? r : JSON.stringify(r)}</li>
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
                    <span className="text-[hsl(var(--chart-emerald))]">🎉</span> {c}
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
                    <span className="text-[hsl(var(--chart-amber))]">❓</span> {c}
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
