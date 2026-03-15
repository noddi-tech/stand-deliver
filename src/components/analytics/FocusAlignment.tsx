import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, RefreshCw, Loader2, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { ClassificationResult, TeamFocusItem } from "@/hooks/useTeamFocus";

// Deterministic color palette for focus labels
const FOCUS_COLORS = [
  "hsl(217, 91%, 60%)",   // blue
  "hsl(160, 84%, 39%)",   // emerald
  "hsl(280, 67%, 55%)",   // purple
  "hsl(43, 96%, 56%)",    // amber
  "hsl(340, 82%, 52%)",   // rose
  "hsl(190, 90%, 40%)",   // teal
];
const UNALIGNED_COLOR = "hsl(215, 16%, 80%)";

function getColorForIndex(idx: number) {
  return FOCUS_COLORS[idx % FOCUS_COLORS.length];
}

interface FocusAlignmentProps {
  focusItems: TeamFocusItem[];
  classification: ClassificationResult | undefined;
  classificationLoading: boolean;
  onRefresh?: () => void;
  compact?: boolean;
}

export function FocusAlignment({ focusItems, classification, classificationLoading, onRefresh, compact }: FocusAlignmentProps) {
  const navigate = useNavigate();

  // Build color map from focus items
  const colorMap: Record<string, string> = {};
  focusItems.forEach((item, i) => {
    colorMap[item.label] = getColorForIndex(i);
  });
  colorMap["Unaligned"] = UNALIGNED_COLOR;

  // Get all unique labels across breakdowns
  const allLabels = focusItems.map((f) => f.label);
  const uniqueLabels = [...new Set(allLabels)];

  if (focusItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">
            Define your team's focus areas to see alignment insights
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("/settings?tab=focus")}>
            <Settings className="h-4 w-4 mr-1" /> Go to Settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (classificationLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Focus Alignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 rounded" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!classification) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Focus Alignment
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6">
          <p className="text-sm text-muted-foreground mb-3">
            No classification data yet.
          </p>
          {onRefresh && (
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4 mr-1" /> Generate Classification
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const { memberBreakdowns } = classification;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Focus Alignment
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={classificationLoading} className="h-7 text-xs">
              {classificationLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          )}
        </div>
        {!compact && (
          <CardDescription className="text-xs">
            How each member's recent work aligns with team focus areas
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <TooltipProvider>
          {memberBreakdowns.map((mb) => {
            const entries = Object.entries(mb.breakdown).filter(([, v]) => v > 0);
            return (
              <div key={mb.memberId} className="space-y-1">
                <p className="text-xs font-medium text-foreground">{mb.memberName}</p>
                <div className="flex h-5 w-full rounded-full overflow-hidden bg-muted">
                  {entries.map(([lbl, pct]) => {
                    const color = colorMap[lbl] || UNALIGNED_COLOR;
                    // Find rationales for this member+label
                    const rationales = classification.classifications
                      .filter((c) => c.focusLabel === lbl)
                      .slice(0, 3);
                    return (
                      <Tooltip key={lbl}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-full transition-all cursor-default"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: color,
                              minWidth: pct > 0 ? "4px" : "0",
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-medium text-xs">{lbl}: {pct}%</p>
                          {rationales.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {rationales.map((r, i) => (
                                <li key={i} className="text-[11px] text-muted-foreground">• {r.rationale}</li>
                              ))}
                            </ul>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TooltipProvider>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
          {uniqueLabels.map((lbl, i) => (
            <div key={lbl} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getColorForIndex(i) }} />
              <span className="text-[11px] text-muted-foreground">{lbl}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: UNALIGNED_COLOR }} />
            <span className="text-[11px] text-muted-foreground">Unaligned</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact inline bar for MemberBreakdown cards */
export function InlineFocusBar({ breakdown, colorMap }: { breakdown: Record<string, number>; colorMap: Record<string, string> }) {
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <TooltipProvider>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
        {entries.map(([lbl, pct]) => (
          <Tooltip key={lbl}>
            <TooltipTrigger asChild>
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: colorMap[lbl] || UNALIGNED_COLOR,
                  minWidth: pct > 0 ? "2px" : "0",
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <span className="text-xs">{lbl}: {pct}%</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
