import { useState, useEffect, useCallback } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, AlertTriangle, X, Check, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

interface DetectedBlocker {
  description: string;
  category: string;
}

interface BlockerDetectorProps {
  text: string;
  onBlockerConfirmed: (blocker: DetectedBlocker) => void;
}

const categoryLabels: Record<string, string> = {
  dependency: "Dependency",
  technical: "Technical",
  external: "External",
  resource: "Resource",
  unclear_requirements: "Unclear Requirements",
  other: "Other",
};

const categoryColors: Record<string, string> = {
  dependency: "bg-warning/10 text-warning-foreground border-warning/20",
  technical: "bg-destructive/10 text-destructive border-destructive/20",
  external: "bg-primary/10 text-primary border-primary/20",
  resource: "bg-accent text-accent-foreground border-border",
  unclear_requirements: "bg-muted text-muted-foreground border-border",
  other: "bg-secondary text-secondary-foreground border-border",
};

export default function BlockerDetector({ text, onBlockerConfirmed }: BlockerDetectorProps) {
  const [blockers, setBlockers] = useState<DetectedBlocker[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [lastText, setLastText] = useState("");

  const detectBlockers = useCallback(async (inputText: string) => {
    if (!inputText.trim() || inputText.trim().length < 10) {
      setBlockers([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-detect-blockers", {
        body: { text: inputText },
      });
      if (error) throw error;
      setBlockers(data.blockers || []);
      setAiAvailable(data.ai_available !== false);
      setDismissed(new Set());
    } catch (err) {
      console.error("Detect error:", err);
      setBlockers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced detection
  useEffect(() => {
    if (text === lastText) return;
    const timer = setTimeout(() => {
      setLastText(text);
      detectBlockers(text);
    }, 1500);
    return () => clearTimeout(timer);
  }, [text, lastText, detectBlockers]);

  const dismissBlocker = (index: number) => {
    setDismissed(prev => new Set(prev).add(index));
  };

  const confirmBlocker = (blocker: DetectedBlocker, index: number) => {
    onBlockerConfirmed(blocker);
    setDismissed(prev => new Set(prev).add(index));
    toast.success("Blocker added");
  };

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type);
    toast.success(type === "up" ? "Thanks!" : "We'll improve detection");
  };

  const visibleBlockers = blockers.filter((_, i) => !dismissed.has(i));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
        Scanning for blockers...
      </div>
    );
  }

  if (visibleBlockers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            AI-detected blockers
          </Badge>
          {!aiAvailable && (
            <span className="text-xs text-muted-foreground">keyword-based</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFeedback("up")} disabled={feedback !== null}>
            <ThumbsUp className={`h-3 w-3 ${feedback === "up" ? "text-primary" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleFeedback("down")} disabled={feedback !== null}>
            <ThumbsDown className={`h-3 w-3 ${feedback === "down" ? "text-destructive" : ""}`} />
          </Button>
        </div>
      </div>

      {visibleBlockers.map((blocker, visIndex) => {
        const origIndex = blockers.findIndex((b, i) => b === blocker && !dismissed.has(i));
        return (
          <Alert key={visIndex} className={`${categoryColors[blocker.category] || categoryColors.other}`}>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex items-center justify-between text-sm">
              <span>{categoryLabels[blocker.category] || blocker.category}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => confirmBlocker(blocker, origIndex)}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dismissBlocker(origIndex)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </AlertTitle>
            <AlertDescription className="text-xs">{blocker.description}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
