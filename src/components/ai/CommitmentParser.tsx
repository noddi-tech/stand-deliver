import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, Pencil, Plus, ThumbsUp, ThumbsDown, Check } from "lucide-react";
import { toast } from "sonner";

interface ParsedCommitment {
  title: string;
  scope: string;
}

interface CommitmentParserProps {
  todayText: string;
  onCommitmentsConfirmed: (commitments: ParsedCommitment[]) => void;
}

const scopeColors: Record<string, string> = {
  feature: "bg-primary/10 text-primary border-primary/20",
  bugfix: "bg-destructive/10 text-destructive border-destructive/20",
  tech_debt: "bg-warning/10 text-warning-foreground border-warning/20",
  meeting: "bg-accent text-accent-foreground border-border",
  review: "bg-secondary text-secondary-foreground border-border",
  other: "bg-muted text-muted-foreground border-border",
};

export default function CommitmentParser({ todayText, onCommitmentsConfirmed }: CommitmentParserProps) {
  const [commitments, setCommitments] = useState<ParsedCommitment[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const parseCommitments = async () => {
    if (!todayText.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-parse-commitments", {
        body: { today_text: todayText },
      });
      if (error) throw error;
      setCommitments(data.commitments || []);
      setAiAvailable(data.ai_available !== false);
      setParsed(true);
    } catch (err) {
      console.error("Parse error:", err);
      setCommitments([{ title: todayText.trim(), scope: "other" }]);
      setAiAvailable(false);
      setParsed(true);
    } finally {
      setLoading(false);
    }
  };

  const removeCommitment = (index: number) => {
    setCommitments(prev => prev.filter((_, i) => i !== index));
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(commitments[index].title);
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    setCommitments(prev => prev.map((c, i) => i === editingIndex ? { ...c, title: editValue } : c));
    setEditingIndex(null);
  };

  const addCommitment = () => {
    setCommitments(prev => [...prev, { title: "New commitment", scope: "other" }]);
    setEditingIndex(commitments.length);
    setEditValue("New commitment");
  };

  const handleFeedback = (type: "up" | "down") => {
    setFeedback(type);
    toast.success(type === "up" ? "Thanks for the feedback!" : "We'll improve the parsing");
  };

  if (!parsed && !loading) {
    return (
      <Button variant="outline" size="sm" onClick={parseCommitments} disabled={!todayText.trim()} className="gap-2">
        <Sparkles className="h-3.5 w-3.5" />
        Parse commitments with AI
      </Button>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          Parsing commitments...
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-32 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3" />
            AI-powered
          </Badge>
          {!aiAvailable && (
            <span className="text-xs text-muted-foreground">AI unavailable — basic parsing used</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => handleFeedback("up")}
            disabled={feedback !== null}
          >
            <ThumbsUp className={`h-3 w-3 ${feedback === "up" ? "text-primary" : ""}`} />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-6 w-6"
            onClick={() => handleFeedback("down")}
            disabled={feedback !== null}
          >
            <ThumbsDown className={`h-3 w-3 ${feedback === "down" ? "text-destructive" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {commitments.map((c, i) => (
          <div
            key={i}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${scopeColors[c.scope] || scopeColors.other}`}
          >
            {editingIndex === i ? (
              <>
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="h-5 w-40 border-none bg-transparent p-0 text-sm focus-visible:ring-0"
                  onKeyDown={e => e.key === "Enter" && saveEdit()}
                  autoFocus
                />
                <button onClick={saveEdit} className="hover:text-foreground">
                  <Check className="h-3 w-3" />
                </button>
              </>
            ) : (
              <>
                <span>{c.title}</span>
                <button onClick={() => startEdit(i)} className="opacity-60 hover:opacity-100">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => removeCommitment(i)} className="opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
        <button
          onClick={addCommitment}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      <Button size="sm" onClick={() => onCommitmentsConfirmed(commitments)} disabled={commitments.length === 0}>
        Confirm {commitments.length} commitment{commitments.length !== 1 ? "s" : ""}
      </Button>
    </div>
  );
}
