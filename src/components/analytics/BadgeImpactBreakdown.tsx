import { ALL_BADGES } from "@/lib/activity-badges";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BadgeImpactBreakdownProps {
  badgeImpactPct?: Record<string, number>;
  compact?: boolean;
}

const BADGE_COLORS: Record<string, string> = {
  feature: "hsl(217, 91%, 60%)",
  bugfix: "hsl(0, 84%, 60%)",
  refactor: "hsl(43, 96%, 56%)",
  infra: "hsl(280, 67%, 55%)",
  docs: "hsl(190, 90%, 40%)",
  test: "hsl(160, 84%, 39%)",
  security: "hsl(340, 82%, 52%)",
  perf: "hsl(50, 95%, 50%)",
  chore: "hsl(215, 16%, 60%)",
  design: "hsl(300, 60%, 55%)",
  review: "hsl(200, 80%, 50%)",
  review_deep: "hsl(200, 80%, 40%)",
  review_light: "hsl(200, 80%, 65%)",
  hotfix: "hsl(15, 90%, 55%)",
  unblock: "hsl(160, 60%, 50%)",
  task: "hsl(120, 40%, 50%)",
  commitment: "hsl(220, 50%, 55%)",
  growth: "hsl(260, 60%, 55%)",
  style: "hsl(300, 50%, 60%)",
};

export function BadgeImpactBreakdown({ badgeImpactPct, compact = false }: BadgeImpactBreakdownProps) {
  if (!badgeImpactPct || Object.keys(badgeImpactPct).length === 0) return null;

  const sorted = Object.entries(badgeImpactPct)
    .filter(([key]) => key !== "unknown")
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {sorted.slice(0, 4).map(([key, pct]) => (
          <span key={key} className="inline-flex items-center gap-0.5">
            {ALL_BADGES[key]?.emoji ?? "📋"} {Math.round(pct)}%
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Impact sources</p>
      {/* Stacked bar */}
      <TooltipProvider>
        <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
          {sorted.map(([key, pct]) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <div
                  style={{
                    width: `${pct}%`,
                    backgroundColor: BADGE_COLORS[key] || "hsl(215, 16%, 60%)",
                    minWidth: pct > 0 ? "4px" : "0",
                  }}
                  className="transition-all"
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {ALL_BADGES[key]?.emoji ?? "📋"} {ALL_BADGES[key]?.label ?? key}: {pct}%
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      {/* Legend pills */}
      <div className="flex flex-wrap gap-2">
        {sorted.slice(0, 5).map(([key, pct]) => (
          <span
            key={key}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/50 text-muted-foreground"
          >
            {ALL_BADGES[key]?.emoji ?? "📋"} {ALL_BADGES[key]?.label ?? key} {Math.round(pct)}%
          </span>
        ))}
      </div>
    </div>
  );
}
