import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

export interface CoachSuggestion {
  original: string;
  category: "too_broad" | "too_vague" | "consider_splitting" | "too_many_items" | "good";
  issue: string;
  rewrite: string;
}

interface StandupCoachCardProps {
  suggestions: CoachSuggestion[];
  overallTip: string | null;
  onApply: (original: string, rewrite: string) => void;
  onDismiss: (original: string) => void;
  onApplyAll: () => void;
  onSubmitAnyway: () => void;
  submitting: boolean;
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  too_broad: { label: "Too broad", color: "bg-warning/20 text-warning border-warning/30" },
  too_vague: { label: "Too vague", color: "bg-warning/20 text-warning border-warning/30" },
  consider_splitting: { label: "Consider splitting", color: "bg-accent/50 text-accent-foreground border-accent" },
  too_many_items: { label: "Too many items", color: "bg-destructive/20 text-destructive border-destructive/30" },
  good: { label: "Looks good", color: "bg-success/20 text-success border-success/30" },
};

export function StandupCoachCard({
  suggestions,
  overallTip,
  onApply,
  onDismiss,
  onApplyAll,
  onSubmitAnyway,
  submitting,
}: StandupCoachCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);

  const actionable = suggestions.filter((s) => s.category !== "good");
  const hasActionable = actionable.some((s) => !dismissed.has(s.original) && !applied.has(s.original));

  const handleApply = (s: CoachSuggestion) => {
    onApply(s.original, s.rewrite);
    setApplied((prev) => new Set(prev).add(s.original));
  };

  const handleDismiss = (s: CoachSuggestion) => {
    onDismiss(s.original);
    setDismissed((prev) => new Set(prev).add(s.original));
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>AI Coach Review</span>
            <Badge variant="outline" className="text-[10px] font-normal">AI-powered</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-3 pt-0">
          {overallTip && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
              <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <span>{overallTip}</span>
            </div>
          )}

          {suggestions.map((s) => {
            const isDismissed = dismissed.has(s.original);
            const isApplied = applied.has(s.original);
            const isGood = s.category === "good";
            const config = categoryConfig[s.category] || categoryConfig.good;

            if (isDismissed || isApplied) return null;

            return (
              <div key={s.original} className="rounded-md border bg-background p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${config.color}`}>{config.label}</Badge>
                  <span className="text-xs text-muted-foreground">{s.issue}</span>
                </div>
                {!isGood && (
                  <div className="text-sm space-y-1">
                    <div className="text-muted-foreground line-through">{s.original}</div>
                    <div className="text-foreground font-medium">→ {s.rewrite}</div>
                  </div>
                )}
                {isGood && (
                  <div className="text-sm text-foreground">{s.original}</div>
                )}
                {!isGood && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleApply(s)}>
                      <Check className="h-3 w-3" /> Apply
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleDismiss(s)}>
                      <X className="h-3 w-3" /> Dismiss
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            {hasActionable && (
              <Button size="sm" variant="outline" className="text-xs" onClick={onApplyAll}>
                Apply all suggestions
              </Button>
            )}
            <Button size="sm" className="text-xs ml-auto" onClick={onSubmitAnyway} disabled={submitting}>
              {hasActionable ? "Submit anyway" : "Submit standup"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
