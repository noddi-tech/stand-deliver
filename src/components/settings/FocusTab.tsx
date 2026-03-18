import { useState, useRef, useImperativeHandle, forwardRef, KeyboardEvent, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Target, Plus, Pencil, Archive, Trash2, RotateCcw, X, Loader2, Sparkles, Check } from "lucide-react";
import { useUserTeam } from "@/hooks/useAnalytics";
import {
  useAllTeamFocusItems,
  useAddFocusItem,
  useUpdateFocusItem,
  useDeleteFocusItem,
  useReclassifyContributions,
  type TeamFocusItem,
} from "@/hooks/useTeamFocus";
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

export function FocusTab() {
  const { data: team } = useUserTeam();
  const teamId = team?.team_id;
  const isLead = team?.role === "lead";
  const { data: items, isLoading } = useAllTeamFocusItems(teamId);
  const addMutation = useAddFocusItem(teamId);
  const updateMutation = useUpdateFocusItem(teamId);
  const deleteMutation = useDeleteFocusItem(teamId);
  const reclassifyMutation = useReclassifyContributions(teamId);

  const tagInputRef = useRef<TagInputHandle>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

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
      const msg = err?.message || "Failed to get suggestions";
      toast({ title: msg, variant: "destructive" });
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
    setEditingId(null);
    setShowForm(true);
    setAiSuggestions(prev => prev.filter(s => s.title !== suggestion.title));
  };

  const dismissSuggestion = (title: string) => {
    setAiSuggestions(prev => prev.filter(s => s.title !== title));
  };

  // Debounced full reclassify: triggers 3s after last focus mutation
  const reclassifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReclassify = useCallback(() => {
    if (reclassifyTimerRef.current) clearTimeout(reclassifyTimerRef.current);
    reclassifyTimerRef.current = setTimeout(() => {
      reclassifyMutation.mutate({ mode: "full" }, {
        onSuccess: (result) => {
          if (result.classified > 0) {
            toast({ title: `Re-classified ${result.classified} activities against updated focus areas` });
          }
          if ((result as any).degraded) {
            toast({ title: (result as any).degraded.message, variant: "destructive" });
          }
        },
        onError: (err: Error) => {
          toast({ title: err.message || "Re-classification failed", variant: "destructive" });
        },
      });
    }, 3000);
  }, [reclassifyMutation]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (reclassifyTimerRef.current) clearTimeout(reclassifyTimerRef.current);
    };
  }, []);

  const activeItems = items?.filter((i) => i.is_active) || [];
  const archivedItems = items?.filter((i) => !i.is_active) || [];
  const existingLabels = [...new Set((items || []).flatMap((i) => splitLabels(i.label)))];

  const resetForm = () => {
    setTitle("");
    setTags([]);
    setDescription("");
    setStartsAt("");
    setEndsAt("");
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
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    await updateMutation.mutateAsync({ id, is_active: false });
    toast({ title: "Focus item archived" });
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
            Define what your team is focused on. AI will classify contributions against these areas and show alignment insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Reclassification progress banner */}
          {reclassifyMutation.progress.status === "running" && (
            <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Re-classifying activities against updated focus areas…
                </span>
                <span>{reclassifyMutation.progress.processed}/{reclassifyMutation.progress.total}</span>
              </div>
              <Progress value={reclassifyMutation.progress.total > 0 ? (reclassifyMutation.progress.processed / reclassifyMutation.progress.total) * 100 : 0} className="h-1.5" />
            </div>
          )}
          {activeItems.length === 0 && !showForm && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Target className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No focus areas defined yet</p>
              {isLead && (
                <Button size="sm" onClick={() => setShowForm(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Focus Area
                </Button>
              )}
            </div>
          )}

          {activeItems.map((item) => {
            const dateLabel = formatDateRange(item);
            const expired = isPastEnd(item);
            const itemTags = splitLabels(item.label);
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-card ${expired ? "opacity-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    {itemTags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
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
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleArchive(item.id)}>
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {isLead && activeItems.length > 0 && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Focus Area
            </Button>
          )}

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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Starts (optional)</label>
                  <Input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Ends (optional)</label>
                  <Input
                    type="date"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="text-sm"
                  />
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
    </div>
  );
}
