import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Plus, Pencil, Archive, Trash2, RotateCcw } from "lucide-react";
import { useUserTeam } from "@/hooks/useAnalytics";
import {
  useAllTeamFocusItems,
  useAddFocusItem,
  useUpdateFocusItem,
  useDeleteFocusItem,
  type TeamFocusItem,
} from "@/hooks/useTeamFocus";
import { toast } from "@/hooks/use-toast";

export function FocusTab() {
  const { data: team } = useUserTeam();
  const teamId = team?.team_id;
  const isLead = team?.role === "lead";
  const { data: items, isLoading } = useAllTeamFocusItems(teamId);
  const addMutation = useAddFocusItem(teamId);
  const updateMutation = useUpdateFocusItem(teamId);
  const deleteMutation = useDeleteFocusItem(teamId);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  const activeItems = items?.filter((i) => i.is_active) || [];
  const archivedItems = items?.filter((i) => !i.is_active) || [];

  // Collect unique labels for suggestions
  const existingLabels = [...new Set(items?.map((i) => i.label) || [])];

  const resetForm = () => {
    setTitle("");
    setLabel("");
    setDescription("");
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!title.trim() || !label.trim()) return;
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, title, label, description: description || undefined });
        toast({ title: "Focus item updated" });
      } else {
        await addMutation.mutateAsync({ title, label, description: description || undefined });
        toast({ title: "Focus item added" });
      }
      resetForm();
    } catch {
      toast({ title: "Error saving focus item", variant: "destructive" });
    }
  };

  const startEdit = (item: TeamFocusItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setLabel(item.label);
    setDescription(item.description || "");
    setShowForm(true);
  };

  const handleArchive = async (id: string) => {
    await updateMutation.mutateAsync({ id, is_active: false });
    toast({ title: "Focus item archived" });
  };

  const handleRestore = async (id: string) => {
    await updateMutation.mutateAsync({ id, is_active: true });
    toast({ title: "Focus item restored" });
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

          {activeItems.map((item) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <Badge variant="secondary" className="text-[10px]">{item.label}</Badge>
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
          ))}

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
              <div className="space-y-1">
                <Input
                  placeholder="Category label, e.g. Short-term, Platform, Tech debt"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="text-sm"
                />
                {existingLabels.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {existingLabels.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground hover:bg-accent transition-colors"
                        onClick={() => setLabel(l)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Textarea
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !label.trim()}>
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
            {archivedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg border border-border opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-foreground">{item.title}</p>
                    <Badge variant="outline" className="text-[10px]">{item.label}</Badge>
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
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
