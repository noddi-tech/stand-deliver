import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User } from "lucide-react";
import { MemberBadgeIcons } from "@/components/badges/MemberBadgeIcons";
import { BadgeLegend } from "@/components/badges/BadgeLegend";
import { BadgeImpactBreakdown } from "@/components/analytics/BadgeImpactBreakdown";
import { InlineFocusBar } from "@/components/analytics/FocusAlignment";
import type { MemberStat, MemberHighlight } from "@/hooks/useTeamSummary";
import type { MemberBadge, BadgeDefinition } from "@/hooks/useBadges";
import type { ClassificationResult, TeamFocusItem } from "@/hooks/useTeamFocus";
import type { MemberBadgeCounts, MemberBadgeImpactPct, MemberBadgeCountPct } from "@/hooks/useMemberBadgeCounts";

const SENTIMENT_CONFIG: Record<string, { label: string; className: string }> = {
  strong: { label: "Strong week", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  steady: { label: "Steady", className: "bg-primary/10 text-primary border-primary/20" },
  needs_attention: { label: "Needs check-in", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
};

export type BreakdownPeriod = "week" | "month" | "quarter" | "year";
export const PERIOD_DAYS: Record<BreakdownPeriod, number> = { week: 7, month: 30, quarter: 90, year: 365 };
const PERIOD_LABELS: Record<BreakdownPeriod, string> = { week: "This Week", month: "This Month", quarter: "This Quarter", year: "This Year" };

interface MemberBreakdownProps {
  memberStats: MemberStat[];
  highlights?: MemberHighlight[];
  teamBadges?: MemberBadge[];
  badgeLookup: Record<string, BadgeDefinition>;
  enrichedMembers?: Array<{
    memberId: string;
    memberName: string;
    codeImpactScore: number;
    hasVIS: boolean;
    reviewsGiven: number;
    avgPRCycleTime: number | null;
  }>;
  classification?: ClassificationResult;
  focusItems?: TeamFocusItem[];
  badgeCounts?: MemberBadgeCounts;
  badgeCountPct?: MemberBadgeCountPct;
  badgeImpactPct?: MemberBadgeImpactPct;
  loading?: boolean;
  highlightsLoading?: boolean;
  period?: BreakdownPeriod;
  onPeriodChange?: (period: BreakdownPeriod) => void;
}

export function MemberBreakdown({
  memberStats,
  highlights,
  teamBadges,
  badgeLookup,
  enrichedMembers,
  classification,
  focusItems,
  badgeCounts,
  badgeCountPct,
  badgeImpactPct,
  loading,
  highlightsLoading,
  period = "week",
  onPeriodChange,
}: MemberBreakdownProps) {
  const [showAll, setShowAll] = useState(true);
  const display = showAll ? memberStats : memberStats.slice(0, 6);

  const getHighlight = (name: string) => highlights?.find((h) => h.name === name);
  const getEnriched = (name: string) => enrichedMembers?.find((m) => m.memberName === name);
  const getMemberBadges = (name: string) => {
    const em = getEnriched(name);
    if (!em || !teamBadges) return [];
    return teamBadges.filter((b) => b.member_id === em.memberId);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Member Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build focus color map for inline bars
  const FOCUS_COLORS = [
    "hsl(217, 91%, 60%)", "hsl(160, 84%, 39%)", "hsl(280, 67%, 55%)",
    "hsl(43, 96%, 56%)", "hsl(340, 82%, 52%)", "hsl(190, 90%, 40%)",
  ];
  const focusColorMap: Record<string, string> = {};
  (focusItems || []).forEach((item, i) => {
    focusColorMap[item.title] = FOCUS_COLORS[i % FOCUS_COLORS.length];
  });
  focusColorMap["Unaligned"] = "hsl(215, 16%, 80%)";

  const getMemberBreakdown = (name: string) => {
    return classification?.memberBreakdowns?.find((mb) => mb.memberName === name)?.breakdown;
  };

  if (!memberStats.length) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            Member Breakdown
          </CardTitle>
          <div className="flex items-center gap-1">
            {(Object.keys(PERIOD_LABELS) as BreakdownPeriod[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "secondary" : "ghost"}
                size="sm"
                className="text-xs h-7 px-2.5"
                onClick={() => onPeriodChange?.(p)}
              >
                {PERIOD_LABELS[p]}
              </Button>
            ))}
            {memberStats.length > 6 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show less" : `Show all (${memberStats.length})`}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {display.map((m) => {
            const highlight = getHighlight(m.name);
            const sentimentConfig = highlight ? SENTIMENT_CONFIG[highlight.sentiment] : null;
            const em = getEnriched(m.name);
            return (
              <Card key={m.name} className="border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{m.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MemberBadgeIcons badges={getMemberBadges(m.name)} lookup={badgeLookup} max={3} />
                      {sentimentConfig && (
                        <Badge variant="outline" className={`text-[10px] ${sentimentConfig.className}`}>
                          {sentimentConfig.label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-foreground">{m.commitments.completionRate}%</p>
                      <p className="text-[10px] text-muted-foreground">Completion</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">{m.standup.participationRate}%</p>
                      <p className="text-[10px] text-muted-foreground">Participation</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-foreground">
                        {em?.codeImpactScore ?? ((m.externalActivity?.githubCommits ?? 0) + (m.externalActivity?.prs ?? 0) + (m.externalActivity?.clickupTasks ?? 0))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {em?.hasVIS ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help border-b border-dotted border-muted-foreground/50">VIS</span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                                <p>Value Impact Score — measures what your work accomplishes, not just code volume.</p>
                                <Link to="/vis-explained" className="text-primary underline mt-1 inline-block">Learn more</Link>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : em ? "Impact" : "Activity"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{m.commitments.done}/{m.commitments.total} done</span>
                      <span>{m.commitments.carried} carried</span>
                    </div>
                    <Progress value={m.commitments.completionRate} className="h-1.5" />
                  </div>

                  {/* Impact-weighted badge distribution */}
                  {(() => {
                    const memberId = em?.memberId;
                    const pct = memberId && (badgeCountPct?.[memberId] || badgeImpactPct?.[memberId]);
                    if (pct && Object.keys(pct).length > 0) {
                      return <BadgeImpactBreakdown badgeImpactPct={pct} compact />;
                    }
                    return null;
                  })()}

                  {getMemberBreakdown(m.name) && (
                    <InlineFocusBar breakdown={getMemberBreakdown(m.name)!} colorMap={focusColorMap} />
                  )}

                  {highlight && (
                    <p className="text-xs text-muted-foreground italic leading-snug">
                      "{highlight.highlight}"
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                    {(m.externalActivity?.githubCommits ?? 0) > 0 && <span>🐙 {m.externalActivity.githubCommits}</span>}
                    {(m.externalActivity?.prs ?? 0) > 0 && <span>🔀 {m.externalActivity.prs}</span>}
                    {(m.externalActivity?.clickupTasks ?? 0) > 0 && <span>📋 {m.externalActivity.clickupTasks}</span>}
                    {em?.reviewsGiven ? <span>👀 {em.reviewsGiven} reviews</span> : null}
                    {em?.avgPRCycleTime !== null && em?.avgPRCycleTime !== undefined && <span>⏱ {em.avgPRCycleTime}h cycle</span>}
                    {m.activeBlockers > 0 && <span className="text-destructive">🚧 {m.activeBlockers}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <div className="mt-4">
          <BadgeLegend />
        </div>
      </CardContent>
    </Card>
  );
}
