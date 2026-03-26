import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, BarChart3, AlertTriangle, Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { useFocusRetrospective, type FocusRetrospective } from "@/hooks/useFocusRecall";

interface FocusRetrospectivePanelProps {
  focusItemId: string | undefined;
  focusTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-muted/50 border border-border">
      <span className="text-lg font-bold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

function MetricsSection({ metrics }: { metrics: Record<string, any> }) {
  const statusOrder = ["done", "in_progress", "active", "carried", "blocked", "dropped"];
  const commitmentsByStatus = metrics.commitments_by_status || {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <MetricPill label="Activities" value={metrics.total_classifications || 0} />
        <MetricPill label="Commitments" value={metrics.total_commitments || 0} />
        <MetricPill label="Contributors" value={metrics.contributor_count || 0} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricPill label="Completion" value={`${metrics.completion_rate || 0}%`} />
        <MetricPill label="Carry Rate" value={`${metrics.carry_forward_rate || 0}%`} />
        <MetricPill label="Blockers" value={metrics.blocker_count || 0} />
      </div>

      {Object.keys(commitmentsByStatus).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Commitment Breakdown</p>
          <div className="flex gap-1.5 flex-wrap">
            {statusOrder
              .filter((s) => commitmentsByStatus[s])
              .map((status) => (
                <Badge key={status} variant="outline" className="text-[10px]">
                  {status}: {commitmentsByStatus[status]}
                </Badge>
              ))}
          </div>
        </div>
      )}

      {metrics.effort_by_tier && Object.keys(metrics.effort_by_tier).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Effort by Impact Tier</p>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(metrics.effort_by_tier).map(([tier, count]) => (
              <Badge key={tier} variant="secondary" className="text-[10px]">
                {tier}: {count as number}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {metrics.blocker_categories && Object.keys(metrics.blocker_categories).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Blocker Categories</p>
          <div className="flex gap-1.5 flex-wrap">
            {Object.entries(metrics.blocker_categories).map(([cat, count]) => (
              <Badge key={cat} variant="outline" className="text-[10px] text-destructive border-destructive/30">
                {cat}: {count as number}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NarrativeSection({ narrative }: { narrative: string }) {
  // Parse markdown sections
  const sections = narrative.split(/^## /m).filter(Boolean);

  return (
    <div className="space-y-4">
      {sections.map((section, i) => {
        const [heading, ...body] = section.split("\n");
        return (
          <div key={i}>
            {heading && <h4 className="text-sm font-semibold text-foreground mb-1">{heading.trim()}</h4>}
            <p className="text-sm text-muted-foreground leading-relaxed">{body.join("\n").trim()}</p>
          </div>
        );
      })}
    </div>
  );
}

export function FocusRetrospectivePanel({ focusItemId, focusTitle, open, onOpenChange }: FocusRetrospectivePanelProps) {
  const { data: retro, isLoading } = useFocusRetrospective(focusItemId);

  const isPending = retro?.status === "pending" || retro?.status === "generating";
  const isFailed = retro?.status === "failed";
  const isComplete = retro?.status === "complete";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Retrospective: {focusTitle}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-40 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          )}

          {!isLoading && !retro && (
            <div className="text-center py-8">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No retrospective available yet.</p>
            </div>
          )}

          {isPending && (
            <div className="text-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 text-primary mx-auto animate-spin" />
              <p className="text-sm text-muted-foreground">Generating retrospective…</p>
              <p className="text-xs text-muted-foreground">This typically takes 10-20 seconds</p>
            </div>
          )}

          {isFailed && (
            <div className="text-center py-8 space-y-3">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">Retrospective generation failed.</p>
              <Button size="sm" variant="outline">
                <RotateCcw className="h-4 w-4 mr-1" /> Retry
              </Button>
            </div>
          )}

          {isComplete && retro && (
            <Accordion type="multiple" defaultValue={["summary", "metrics", "recommendations"]} className="space-y-2">
              <AccordionItem value="summary" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Narrative
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {retro.ai_narrative ? (
                    <NarrativeSection narrative={retro.ai_narrative} />
                  ) : (
                    <p className="text-sm text-muted-foreground">No narrative available.</p>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="metrics" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Metrics
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <MetricsSection metrics={retro.metrics} />
                </AccordionContent>
              </AccordionItem>

              {retro.ai_recommendations && retro.ai_recommendations.length > 0 && (
                <AccordionItem value="recommendations" className="border rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      Recommendations ({retro.ai_recommendations.length})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3">
                      {retro.ai_recommendations.map((rec: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg border border-border bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-foreground">{rec.title}</p>
                            <Badge
                              variant={rec.priority === "high" ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {rec.priority}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{rec.description}</p>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
