import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, Loader2, Sparkles } from "lucide-react";
import { useUpdateGapSuggestion, type GapSuggestion, type FocusGapAnalysis } from "@/hooks/useFocusRecall";
import { toast } from "@/hooks/use-toast";

interface FocusGapAnalysisCardProps {
  analysis: FocusGapAnalysis | null | undefined;
  isLoading: boolean;
  onAcceptSuggestion?: (suggestion: GapSuggestion) => void;
}

const typeColors: Record<string, string> = {
  deferred: "text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950",
  blocker: "text-destructive border-destructive/30 bg-destructive/5",
  capacity: "text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-950",
  improvement: "text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950",
  new: "text-purple-600 border-purple-200 bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-950",
};

export function FocusGapAnalysisCard({ analysis, isLoading, onAcceptSuggestion }: FocusGapAnalysisCardProps) {
  const updateSuggestion = useUpdateGapSuggestion();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Analyzing gaps between versions…</span>
        </div>
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  if (!analysis || !analysis.suggestions || analysis.suggestions.length === 0) {
    return (
      <div className="text-center py-6 border border-dashed border-border rounded-lg">
        <Sparkles className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No gap analysis available yet.</p>
      </div>
    );
  }

  const handleAcceptReject = async (suggestionId: string, accepted: boolean) => {
    try {
      await updateSuggestion.mutateAsync({
        analysisId: analysis.id,
        suggestionId,
        accepted,
      });
      const suggestion = analysis.suggestions.find((s) => s.suggestion_id === suggestionId);
      if (accepted && suggestion && onAcceptSuggestion) {
        onAcceptSuggestion(suggestion);
      }
    } catch {
      toast({ title: "Failed to update suggestion", variant: "destructive" });
    }
  };

  const pending = analysis.suggestions.filter((s) => s.accepted === null);
  const accepted = analysis.suggestions.filter((s) => s.accepted === true);
  const rejected = analysis.suggestions.filter((s) => s.accepted === false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          AI Gap Analysis
        </Badge>
        <span className="text-xs text-muted-foreground">
          {pending.length} pending · {accepted.length} accepted · {rejected.length} rejected
        </span>
      </div>

      {pending.map((suggestion) => (
        <SuggestionRow
          key={suggestion.suggestion_id}
          suggestion={suggestion}
          onAccept={() => handleAcceptReject(suggestion.suggestion_id, true)}
          onReject={() => handleAcceptReject(suggestion.suggestion_id, false)}
        />
      ))}

      {accepted.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Accepted</p>
          {accepted.map((suggestion) => (
            <SuggestionRow key={suggestion.suggestion_id} suggestion={suggestion} accepted />
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Rejected</p>
          {rejected.map((suggestion) => (
            <SuggestionRow key={suggestion.suggestion_id} suggestion={suggestion} rejected />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onAccept,
  onReject,
  accepted,
  rejected,
}: {
  suggestion: GapSuggestion;
  onAccept?: () => void;
  onReject?: () => void;
  accepted?: boolean;
  rejected?: boolean;
}) {
  const typeColor = typeColors[suggestion.type] || "";

  return (
    <div
      className={`p-3 rounded-lg border ${
        accepted
          ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30 opacity-80"
          : rejected
          ? "border-border opacity-50"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
            <Badge variant="outline" className={`text-[10px] ${typeColor}`}>
              {suggestion.type}
            </Badge>
            <Badge
              variant={suggestion.priority === "high" ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {suggestion.priority}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{suggestion.description}</p>
        </div>
        {!accepted && !rejected && (
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={onAccept}
              title="Accept"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={onReject}
              title="Reject"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
