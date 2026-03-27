import { useState, useRef, useImperativeHandle, forwardRef, KeyboardEvent, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Target, Plus, Pencil, Archive, Trash2, RotateCcw, X, Loader2, Sparkles, Check,
  ChevronRight, FolderOpen, CheckCircle, FileText, GitBranch, AlertTriangle,
} from "lucide-react";
import { useUserTeam } from "@/hooks/useAnalytics";
import {
  useAllTeamFocusItems,
  useAddFocusItem,
  useUpdateFocusItem,
  useDeleteFocusItem,
  useReclassifyContributions,
  type TeamFocusItem,
} from "@/hooks/useTeamFocus";
import {
  useCompleteFocusArea,
  useFocusRetrospective,
  useFocusInsights,
  useDismissInsight,
  useCreateFocusV2,
  useFocusGapAnalysis,
  type FocusInsight,
} from "@/hooks/useFocusRecall";
import { FocusRetrospectivePanel } from "@/components/focus/FocusRetrospectivePanel";
import { FocusPredecessorPicker } from "@/components/focus/FocusPredecessorPicker";
import { FocusGapAnalysisCard } from "@/components/focus/FocusGapAnalysisCard";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface AISuggestion {
  title: string;
  tags: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

function splitLabels(label: string): string[] {
  return label.split(",").map((t) => t.trim()).filter(Boolean);
}

function formatDateRange(item: TeamFocusItem) {
  const start = item.starts_at ? new Date(item.starts_at) : null;
  const end = item.ends_at ? new Date(item.ends_at) : null;
  if (start && end) return `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
  if (end) return `Until ${format(end, "MMM d")}`;
  if (start) return `From ${format(start, "MMM d")}`;
  return null;
}

function isPastEnd(item: TeamFocusItem) {
  if (!item.ends_at) return false;
  return new Date(item.ends_at) < new Date();
}

export interface TagInputHandle {
  flush: () => string[];
}

const TagInput = forwardRef<TagInputHandle, {
  tags: string[];
  setTags: (t: string[]) => void;
  suggestions: string[];
}>(function TagInput({ tags, setTags, suggestions }, ref) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    flush: () => {
      const trimmed = input.trim();
      if (trimmed && !tags.includes(trimmed)) {
        const next = [...tags, trimmed];
        setTags(next);
        setInput("");
        return next;
      }
      return tags;
    },
  }));

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "," || e.key === "Enter") && input.trim()) {
      e.preventDefault();
      addTag(input);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleChange = (val: string) => {
    if (val.includes(",")) {
      const parts = val.split(",");
      parts.slice(0, -1).forEach((p) => addTag(p));
      setInput(parts[parts.length - 1]);
    } else {
      setInput(val);
    }
  };

  const unusedSuggestions = suggestions.filter((s) => !tags.includes(s));

  return (
    <div className="space-y-1">
      <div
        className="flex flex-wrap gap-1 items-center min-h-[40px] rounded-md border border-input bg-background px-3 py-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "e.g. Short-term, Platform, Tech debt" : "Add tag…"}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        />
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {unusedSuggestions.map((l) => (
            <button
              key={l}
              type="button"
              className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent transition-colors"
              onClick={() => addTag(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

/** Renders a single focus item row */
function FocusItemRow({
  item,
  isLead,
  isChild,
  onEdit,
  onArchive,
  onComplete,
  predecessorTitle,
}: {
  item: TeamFocusItem;
  isLead: boolean;
  isChild?: boolean;
  onEdit: (item: TeamFocusItem) => void;
  onArchive: (id: string) => void;
  onComplete?: (id: string) => void;
  predecessorTitle?: string;
}) {
  const dateLabel = formatDateRange(item);
  const expired = isPastEnd(item);
  const itemTags = splitLabels(item.label);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-card ${expired ? "opacity-50" : ""} ${isChild ? "ml-6 border-l-2 border-l-primary/20" : ""}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {itemTags.map((t) => (
            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
          ))}
          {predecessorTitle && (
            <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
              <GitBranch className="h-2.5 w-2.5" />
              v2 of {predecessorTitle}
            </Badge>
          )}
          {dateLabel && (
            <span className={`text-[10px] ${expired ? "text-destructive" : "text-muted-foreground"}`}>
              {expired ? `Ended ${dateLabel.replace("Until ", "")}` : dateLabel}
            </span>
          )}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
      {isLead && (
        <div className="flex gap-1 shrink-0">
          {onComplete && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => onComplete(item.id)} title="Complete">
              <CheckCircle className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(item)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onArchive(item.id)}>
            <Archive className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** Completed focus item row with retrospective status */
function CompletedFocusItemRow({
  item,
  isLead,
  onViewRetrospective,
  onCreateV2,
  predecessorTitle,
}: {
  item: TeamFocusItem;
  isLead: boolean;
  onViewRetrospective: (id: string, title: string) => void;
  onCreateV2: (item: TeamFocusItem) => void;
  predecessorTitle?: string;
}) {
  const { data: retro, isLoading: retroLoading } = useFocusRetrospective(item.id);
  const itemTags = splitLabels(item.label);
  const completedDate = (item as any).completed_at ? format(new Date((item as any).completed_at), "MMM d, yyyy") : null;

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="text-sm font-medium text-foreground">{item.title}</p>
          {itemTags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
          ))}
          {predecessorTitle && (
            <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
              <GitBranch className="h-2.5 w-2.5" />
              v2 of {predecessorTitle}
            </Badge>
          )}
          {completedDate && (
            <span className="text-[10px] text-muted-foreground">Completed {completedDate}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {retroLoading && <Skeleton className="h-6 w-24 rounded" />}
          {!retroLoading && retro?.status === "pending" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating…
            </Badge>
          )}
          {!retroLoading && retro?.status === "generating" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating…
            </Badge>
          )}
          {!retroLoading && retro?.status === "complete" && (
            <>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onViewRetrospective(item.id, item.title)}>
                <FileText className="h-3 w-3" /> View Retrospective
              </Button>
              {isLead && (
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onCreateV2(item)}>
                  <GitBranch className="h-3 w-3" /> Create v2
                </Button>
              )}
            </>
          )}
          {!retroLoading && retro?.status === "failed" && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" /> Failed
            </Badge>
          )}
          {!retroLoading && !retro && isLead && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => onCreateV2(item)}>
              <GitBranch className="h-3 w-3" /> Create v2
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Focus Insights Banner */
function FocusInsightsBanner({ teamId }: { teamId: string }) {
  const { data: insights } = useFocusInsights(teamId);
  const dismissMutation = useDismissInsight(teamId);

  if (!insights || insights.length === 0) return null;

  return (
    <div className="space-y-2">
      {insights.slice(0, 3).map((insight) => (
        <div key={insight.id} className="p-3 rounded-lg border border-primary/20 bg-primary/[0.02] flex items-start gap-3">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{insight.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => dismissMutation.mutate(insight.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function FocusTab() {
  const { data: team } = useUserTeam();
  const teamId = team?.team_id;
  const isLead = team?.role === "lead";
  const { data: items, isLoading } = useAllTeamFocusItems(teamId);
  const addMutation = useAddFocusItem(teamId);
  const updateMutation = useUpdateFocusItem(teamId);
  const deleteMutation = useDeleteFocusItem(teamId);
  const reclassifyMutation = useReclassifyContributions(teamId);
  const completeMutation = useCompleteFocusArea(teamId);
  const createV2Mutation = useCreateFocusV2(teamId);

  const tagInputRef = useRef<TagInputHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Complete confirmation dialog
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null);
  const completeConfirmItem = items?.find((i) => i.id === completeConfirmId);

  // Retrospective panel
  const [retroPanelOpen, setRetroPanelOpen] = useState(false);
  const [retroFocusId, setRetroFocusId] = useState<string>();
  const [retroFocusTitle, setRetroFocusTitle] = useState("");

  // V2 creation dialog
  const [v2DialogOpen, setV2DialogOpen] = useState(false);
  const [v2PredecessorId, setV2PredecessorId] = useState<string | null>(null);
  const [v2PredecessorTitle, setV2PredecessorTitle] = useState("");
  const [v2Title, setV2Title] = useState("");
  const [v2Tags, setV2Tags] = useState<string[]>([]);
  const [v2Description, setV2Description] = useState("");
  const v2TagInputRef = useRef<TagInputHandle>(null);

  const fetchAiSuggestions = async () => {
    if (!teamId) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-recommend-focus", {
        body: { team_id: teamId },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      setAiSuggestions(data?.suggestions || []);
      if (!data?.suggestions?.length) {
        toast({ title: "No suggestions — not enough recent activity data" });
      }
    } catch (err: any) {
      toast({ title: err?.message || "Failed to get suggestions", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const addFromSuggestion = (suggestion: AISuggestion) => {
    setTitle(suggestion.title);
    setTags(suggestion.tags.split(",").map(t => t.trim()).filter(Boolean));
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setParentId(null);
    setEditingId(null);
    setShowForm(true);
    setAiSuggestions(prev => prev.filter(s => s.title !== suggestion.title));
  };

  const dismissSuggestion = (title: string) => {
    setAiSuggestions(prev => prev.filter(s => s.title !== title));
  };

  // Debounced full reclassify
  const reclassifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReclassify = useCallback(() => {
    if (reclassifyTimerRef.current) clearTimeout(reclassifyTimerRef.current);
    reclassifyTimerRef.current = setTimeout(() => {
      reclassifyMutation.mutate({ mode: "full" }, {
        onSuccess: () => {
          toast({ title: "Re-classification started in background" });
        },
        onError: (err: Error) => {
          toast({ title: err.message || "Re-classification failed", variant: "destructive" });
        },
      });
    }, 3000);
  }, [reclassifyMutation]);

  useEffect(() => {
    return () => {
      if (reclassifyTimerRef.current) clearTimeout(reclassifyTimerRef.current);
    };
  }, []);

  // Auto-expand groups on load
  useEffect(() => {
    if (items) {
      const groupIds = new Set(
        items.filter(i => i.is_active && !i.parent_id && items.some(c => c.parent_id === i.id && c.is_active))
          .map(i => i.id)
      );
      setExpandedGroups(groupIds);
    }
  }, [items]);

  const allItems = items || [];
  const activeItems = allItems.filter((i) => i.is_active && !(i as any).completed_at);
  const completedItems = allItems.filter((i) => (i as any).completed_at);
  const archivedItems = allItems.filter((i) => !i.is_active && !(i as any).completed_at);
  const existingLabels = [...new Set(allItems.flatMap((i) => splitLabels(i.label)))];

  // Build a map from id -> title for predecessor display
  const itemTitleMap = new Map(allItems.map((i) => [i.id, i.title]));

  // Build hierarchy for active items
  const topLevelItems = activeItems.filter(i => !i.parent_id);
  const childrenByParent = new Map<string, TeamFocusItem[]>();
  for (const item of activeItems) {
    if (item.parent_id) {
      const existing = childrenByParent.get(item.parent_id) || [];
      existing.push(item);
      childrenByParent.set(item.parent_id, existing);
    }
  }

  const availableParents = topLevelItems.filter(i => i.id !== editingId);
  const isReclassifyRunning = reclassifyMutation.progress.status === "running";
  const isReclassifyStalled = isReclassifyRunning && reclassifyMutation.progress.stalled;

  const resetForm = () => {
    setTitle("");
    setTags([]);
    setDescription("");
    setStartsAt("");
    setEndsAt("");
    setParentId(null);
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    const finalTags = tagInputRef.current?.flush() ?? tags;
    if (!title.trim() || finalTags.length === 0) return;
    const payload = {
      title,
      label: finalTags.join(", "),
      description: description || undefined,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      parent_id: parentId || null,
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
        toast({ title: "Focus item updated" });
      } else {
        await addMutation.mutateAsync(payload);
        toast({ title: "Focus item added" });
      }
      resetForm();
      scheduleReclassify();
    } catch {
      toast({ title: "Error saving focus item", variant: "destructive" });
    }
  };

  const startEdit = (item: TeamFocusItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setTags(splitLabels(item.label));
    setDescription(item.description || "");
    setStartsAt(item.starts_at ? item.starts_at.split("T")[0] : "");
    setEndsAt(item.ends_at ? item.ends_at.split("T")[0] : "");
    setParentId(item.parent_id || null);
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    await updateMutation.mutateAsync({ id, is_active: false });
    toast({ title: "Focus item archived" });
  };

  const handleComplete = async () => {
    if (!completeConfirmId) return;
    try {
      await completeMutation.mutateAsync(completeConfirmId);
      toast({ title: "Focus area completed — generating retrospective…" });
    } catch {
      toast({ title: "Failed to complete focus area", variant: "destructive" });
    }
    setCompleteConfirmId(null);
  };

  const handleRestore = async (id: string) => {
    await updateMutation.mutateAsync({ id, is_active: true });
    toast({ title: "Focus item restored" });
    scheduleReclassify();
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    toast({ title: "Focus item deleted" });
  };

  const openRetroPanel = (focusId: string, focusTitle: string) => {
    setRetroFocusId(focusId);
    setRetroFocusTitle(focusTitle);
    setRetroPanelOpen(true);
  };

  const openV2Dialog = (predecessor: TeamFocusItem) => {
    setV2PredecessorId(predecessor.id);
    setV2PredecessorTitle(predecessor.title);
    setV2Title(`${predecessor.title} v2`);
    setV2Tags(splitLabels(predecessor.label));
    setV2Description("");
    setV2DialogOpen(true);
  };

  const handleCreateV2 = async () => {
    const finalTags = v2TagInputRef.current?.flush() ?? v2Tags;
    if (!v2Title.trim() || finalTags.length === 0 || !v2PredecessorId) return;
    try {
      await createV2Mutation.mutateAsync({
        title: v2Title,
        label: finalTags.join(", "),
        description: v2Description || undefined,
        predecessorId: v2PredecessorId,
      });
      toast({ title: "v2 focus area created" });
      setV2DialogOpen(false);
    } catch {
      toast({ title: "Failed to create v2", variant: "destructive" });
    }
  };

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5" /> Team Focus</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Team Focus Areas
          </CardTitle>
          <CardDescription>
            Define what your team is focused on. Complete focus areas to generate AI retrospectives and create v2 iterations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Focus Insights Banner */}
          {teamId && <FocusInsightsBanner teamId={teamId} />}

          {/* Reclassification progress banner */}
          {isReclassifyRunning && (
            <div className={`rounded-lg border p-3 space-y-2 ${isReclassifyStalled ? "border-destructive/30 bg-destructive/[0.06]" : "border-primary/20 bg-primary/[0.02]"}`}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {isReclassifyStalled
                    ? <AlertTriangle className="h-3 w-3 text-destructive" />
                    : <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                  {isReclassifyStalled
                    ? "Re-classification stalled. Please retry."
                    : reclassifyMutation.progress.total > 0
                    ? "Re-classifying activities against updated focus areas…"
                    : "Preparing re-classification…"}
                </span>
                {reclassifyMutation.progress.total > 0 && (
                  <span>{reclassifyMutation.progress.processed}/{reclassifyMutation.progress.total}</span>
                )}
              </div>
              <Progress
                value={reclassifyMutation.progress.total > 0
                  ? (reclassifyMutation.progress.processed / reclassifyMutation.progress.total) * 100
                  : undefined}
                className="h-1.5"
              />
              {isReclassifyStalled && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => reclassifyMutation.mutate({ mode: "full" }, {
                      onSuccess: () => toast({ title: "Re-classification started in background" }),
                      onError: (err: Error) => toast({ title: err.message || "Re-classification failed", variant: "destructive" }),
                    })}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Retry now
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeItems.length === 0 && !showForm && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No focus areas defined yet</p>
              {isLead && (
                <div className="flex gap-2 justify-center">
                  <Button size="sm" onClick={() => setShowForm(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Focus Area
                  </Button>
                  <Button size="sm" variant="outline" onClick={fetchAiSuggestions} disabled={aiLoading}>
                    {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                    Suggest with AI
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Active focus items */}
          {topLevelItems.map((item) => {
            const children = childrenByParent.get(item.id) || [];
            const hasChildren = children.length > 0;
            const isExpanded = expandedGroups.has(item.id);
            const predTitle = (item as any).predecessor_id ? itemTitleMap.get((item as any).predecessor_id) : undefined;

            if (!hasChildren) {
              return (
                <FocusItemRow
                  key={item.id}
                  item={item}
                  isLead={isLead}
                  onEdit={startEdit}
                  onArchive={handleArchive}
                  onComplete={(id) => setCompleteConfirmId(id)}
                  predecessorTitle={predTitle}
                />
              );
            }

            return (
              <Collapsible key={item.id} open={isExpanded} onOpenChange={() => toggleGroup(item.id)}>
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-start gap-3 p-3">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 mt-0.5 shrink-0">
                        <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <FolderOpen className="h-3.5 w-3.5 text-primary" />
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        {splitLabels(item.label).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                        {predTitle && (
                          <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/30">
                            <GitBranch className="h-2.5 w-2.5" />
                            v2 of {predTitle}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          {children.length} task{children.length !== 1 ? "s" : ""}
                        </Badge>
                        {formatDateRange(item) && (
                          <span className={`text-[10px] ${isPastEnd(item) ? "text-destructive" : "text-muted-foreground"}`}>
                            {formatDateRange(item)}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                    {isLead && (
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => setCompleteConfirmId(item.id)} title="Complete">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleArchive(item.id)}>
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2">
                      {children.map((child) => (
                        <FocusItemRow
                          key={child.id}
                          item={child}
                          isLead={isLead}
                          isChild
                          onEdit={startEdit}
                          onArchive={handleArchive}
                          onComplete={(id) => setCompleteConfirmId(id)}
                        />
                      ))}
                      {isLead && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-6 h-7 text-xs text-muted-foreground"
                          onClick={() => { setParentId(item.id); setShowForm(true); }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add sub-task
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          {isLead && activeItems.length > 0 && !showForm && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Focus Area
              </Button>
              <Button size="sm" variant="outline" onClick={fetchAiSuggestions} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Suggest with AI
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reclassifyMutation.mutate({ mode: "full" }, {
                  onSuccess: () => toast({ title: "Re-classification started in background" }),
                  onError: (err: Error) => toast({ title: err.message || "Re-classification failed", variant: "destructive" }),
                })}
                disabled={isReclassifyRunning && !isReclassifyStalled}
              >
                {isReclassifyRunning && !isReclassifyStalled
                  ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  : <RotateCcw className="h-4 w-4 mr-1" />}
                Re-classify
              </Button>
            </div>
          )}

          {/* AI Suggestions */}
          {aiSuggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Sparkles className="h-3 w-3" />
                  AI-suggested focus areas
                </Badge>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAiSuggestions([])}>
                  Dismiss all
                </Button>
              </div>
              {aiSuggestions.map((suggestion) => {
                const suggestionTags = suggestion.tags.split(",").map(t => t.trim()).filter(Boolean);
                const priorityColor = suggestion.priority === "high" ? "text-destructive" : suggestion.priority === "medium" ? "text-primary" : "text-muted-foreground";
                return (
                  <div key={suggestion.title} className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/[0.02] space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${priorityColor}`}>{suggestion.priority}</Badge>
                        </div>
                        <div className="flex gap-1 flex-wrap mb-1">
                          {suggestionTags.map(t => (
                            <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-primary" onClick={() => addFromSuggestion(suggestion)} title="Add as focus area">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => dismissSuggestion(suggestion.title)} title="Dismiss">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add/Edit Form */}
          {showForm && (
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/[0.02] space-y-3">
              <Input
                placeholder="e.g. Ship payment integration"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-sm"
              />
              <TagInput ref={tagInputRef} tags={tags} setTags={setTags} suggestions={existingLabels} />
              <Textarea
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              {availableParents.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Parent focus group (optional)</label>
                  <Select
                    value={parentId || "__none__"}
                    onValueChange={(v) => setParentId(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="None (top-level)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (top-level)</SelectItem>
                      {availableParents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Starts (optional)</label>
                  <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Ends (optional)</label>
                  <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || tags.length === 0}>
                  {editingId ? "Update" : "Add"}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Section */}
      {completedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              Completed ({completedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {completedItems.map((item) => (
              <CompletedFocusItemRow
                key={item.id}
                item={item}
                isLead={isLead}
                onViewRetrospective={openRetroPanel}
                onCreateV2={openV2Dialog}
                predecessorTitle={(item as any).predecessor_id ? itemTitleMap.get((item as any).predecessor_id) : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Archived Section */}
      {archivedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Archived</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {archivedItems.map((item) => {
              const itemTags = splitLabels(item.label);
              return (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border border-border opacity-60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-foreground">{item.title}</p>
                      {itemTags.map((t) => (
                        <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  {isLead && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleRestore(item.id)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Complete Confirmation Dialog */}
      <Dialog open={!!completeConfirmId} onOpenChange={(open) => !open && setCompleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Focus Area</DialogTitle>
            <DialogDescription>
              This will mark "{completeConfirmItem?.title}" as completed and generate an AI retrospective analyzing all related activity, commitments, and blockers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCompleteConfirmId(null)}>Cancel</Button>
            <Button onClick={handleComplete} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retrospective Panel */}
      <FocusRetrospectivePanel
        focusItemId={retroFocusId}
        focusTitle={retroFocusTitle}
        open={retroPanelOpen}
        onOpenChange={setRetroPanelOpen}
      />

      {/* V2 Creation Dialog */}
      <Dialog open={v2DialogOpen} onOpenChange={setV2DialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Create v2: {v2PredecessorTitle}
            </DialogTitle>
            <DialogDescription>
              Create a new iteration building on what was learned from "{v2PredecessorTitle}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Focus area title"
              value={v2Title}
              onChange={(e) => setV2Title(e.target.value)}
              className="text-sm"
            />
            <TagInput ref={v2TagInputRef} tags={v2Tags} setTags={setV2Tags} suggestions={existingLabels} />
            <Textarea
              placeholder="What's different in v2? What are you building on?"
              value={v2Description}
              onChange={(e) => setV2Description(e.target.value)}
              className="text-sm min-h-[60px]"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setV2DialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateV2} disabled={!v2Title.trim() || v2Tags.length === 0 || createV2Mutation.isPending}>
              {createV2Mutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <GitBranch className="h-4 w-4 mr-1" />}
              Create v2
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
