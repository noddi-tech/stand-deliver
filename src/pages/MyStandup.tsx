import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Check, X, AlertTriangle, Loader2, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type CommitmentStatus = Database["public"]["Enums"]["commitment_status"];
type CommitmentPriority = Database["public"]["Enums"]["commitment_priority"];
type MoodType = Database["public"]["Enums"]["mood_type"];

const moods: { value: MoodType; emoji: string; label: string }[] = [
  { value: "great", emoji: "🚀", label: "Great" },
  { value: "good", emoji: "👍", label: "Good" },
  { value: "okay", emoji: "😐", label: "Okay" },
  { value: "struggling", emoji: "😓", label: "Struggling" },
  { value: "rough", emoji: "😰", label: "Rough" },
];

const priorityColors: Record<CommitmentPriority, string> = {
  high: "text-destructive border-destructive/30",
  medium: "text-warning border-warning/30",
  low: "text-muted-foreground border-border",
};

interface NewCommitment {
  title: string;
  priority: CommitmentPriority;
}

export default function MyStandup() {
  const queryClient = useQueryClient();
  const { data: teamData, isLoading: teamLoading } = useUserTeam();
  const memberId = teamData?.id;
  const teamId = teamData?.team_id;

  const [newFocusTitle, setNewFocusTitle] = useState("");
  const [newFocusPriority, setNewFocusPriority] = useState<CommitmentPriority>("medium");
  const [todayCommitments, setTodayCommitments] = useState<NewCommitment[]>([]);
  const [blockersText, setBlockersText] = useState("");
  const [notesText, setNotesText] = useState("");
  const [mood, setMood] = useState<MoodType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch previous commitments
  const { data: previousCommitments = [], isLoading: commitmentsLoading } = useQuery({
    queryKey: ["previous-commitments", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select("*")
        .eq("member_id", memberId!)
        .in("status", ["active", "in_progress", "blocked", "carried"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Track local status overrides
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CommitmentStatus>>({});

  const effectiveStatuses = useMemo(() => {
    const map: Record<string, CommitmentStatus> = {};
    previousCommitments.forEach((c) => {
      map[c.id] = statusOverrides[c.id] || c.status;
    });
    return map;
  }, [previousCommitments, statusOverrides]);

  const resolvedCount = Object.values(effectiveStatuses).filter(
    (s) => s === "done" || s === "dropped"
  ).length;
  const totalPrevious = previousCommitments.length;
  const allResolved = totalPrevious === 0 || resolvedCount === totalPrevious;
  const progressPercent = totalPrevious > 0 ? Math.round((resolvedCount / totalPrevious) * 100) : 100;

  const updateCommitmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CommitmentStatus }) => {
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "done" || status === "dropped") {
        updates.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase.from("commitments").update(updates).eq("id", id);
      if (error) throw error;
    },
  });

  const handleStatusChange = (id: string, status: CommitmentStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }));
  };

  const addTodayCommitment = () => {
    if (!newFocusTitle.trim()) return;
    setTodayCommitments((prev) => [...prev, { title: newFocusTitle.trim(), priority: newFocusPriority }]);
    setNewFocusTitle("");
    setNewFocusPriority("medium");
  };

  const removeTodayCommitment = (idx: number) => {
    setTodayCommitments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!memberId || !teamId) return;
    if (!mood) {
      toast.error("Please select your mood");
      return;
    }
    if (todayCommitments.length === 0) {
      toast.error("Add at least one focus item for today");
      return;
    }

    setSubmitting(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");

      // Update previous commitments
      for (const [id, status] of Object.entries(statusOverrides)) {
        await updateCommitmentMutation.mutateAsync({ id, status });
      }

      // Upsert session
      let sessionId: string;
      const { data: existingSession } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId)
        .eq("session_date", today)
        .maybeSingle();

      if (existingSession) {
        sessionId = existingSession.id;
      } else {
        const { data: newSession, error } = await supabase
          .from("standup_sessions")
          .insert({ team_id: teamId, session_date: today, status: "collecting" })
          .select("id")
          .single();
        if (error) throw error;
        sessionId = newSession.id;
      }

      // Insert standup response
      const { error: respError } = await supabase.from("standup_responses").insert({
        session_id: sessionId,
        member_id: memberId,
        mood,
        today_text: todayCommitments.map((c) => c.title).join("\n"),
        yesterday_text: previousCommitments.map((c) => `${c.title} → ${effectiveStatuses[c.id]}`).join("\n"),
        blockers_text: blockersText || null,
        notes: notesText || null,
        submitted_via: "web",
      });
      if (respError) throw respError;

      // Insert new commitments
      for (const c of todayCommitments) {
        const { error } = await supabase.from("commitments").insert({
          title: c.title,
          priority: c.priority,
          member_id: memberId,
          team_id: teamId,
          origin_session_id: sessionId,
          current_session_id: sessionId,
        });
        if (error) throw error;
      }

      toast.success("Standup submitted!");
      queryClient.invalidateQueries({ queryKey: ["previous-commitments"] });
      setStatusOverrides({});
      setTodayCommitments([]);
      setBlockersText("");
      setNotesText("");
      setMood(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit standup");
    } finally {
      setSubmitting(false);
    }
  };

  if (teamLoading || commitmentsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        You're not part of a team yet. Ask your admin to add you.
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Standup</h1>

      {/* Section 1: Resolve Previous Commitments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Resolve Previous Commitments</span>
            <span className="text-sm font-normal text-muted-foreground">
              {resolvedCount} of {totalPrevious} resolved
            </span>
          </CardTitle>
          <Progress value={progressPercent} className="h-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {previousCommitments.length === 0 && (
            <p className="text-sm text-muted-foreground">No outstanding commitments. You're all clear!</p>
          )}
          {previousCommitments.map((c) => {
            const current = effectiveStatuses[c.id];
            const isResolved = current === "done" || current === "dropped";
            return (
              <div
                key={c.id}
                className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-opacity ${
                  isResolved ? "opacity-50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isResolved ? "line-through" : ""}`}>
                      {c.title}
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${priorityColors[c.priority]}`}>
                      {c.priority}
                    </Badge>
                    {c.carry_count > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        carried {c.carry_count}x
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={current === "done" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => handleStatusChange(c.id, "done")}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant={current === "in_progress" ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => handleStatusChange(c.id, "in_progress")}
                  >
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant={current === "blocked" ? "destructive" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => handleStatusChange(c.id, "blocked")}
                  >
                    <AlertTriangle className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant={current === "dropped" ? "secondary" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => handleStatusChange(c.id, "dropped")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Section 2: Today's Focus */}
      <Card className={!allResolved ? "opacity-60" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {!allResolved && <Lock className="h-4 w-4 text-muted-foreground" />}
            Today's Focus
          </CardTitle>
          {!allResolved && (
            <p className="text-xs text-muted-foreground">
              Resolve all previous commitments to unlock this section
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {allResolved && (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="What will you work on today?"
                  value={newFocusTitle}
                  onChange={(e) => setNewFocusTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTodayCommitment()}
                  className="flex-1"
                />
                <Select value={newFocusPriority} onValueChange={(v) => setNewFocusPriority(v as CommitmentPriority)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="icon" onClick={addTodayCommitment} disabled={!newFocusTitle.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {todayCommitments.map((c, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="flex-1 text-sm">{c.title}</span>
                  <Badge variant="outline" className={`text-[10px] ${priorityColors[c.priority]}`}>
                    {c.priority}
                  </Badge>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeTodayCommitment(i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Blockers & Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Blockers & Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Any blockers? What's preventing you from making progress?"
            value={blockersText}
            onChange={(e) => setBlockersText(e.target.value)}
            rows={3}
          />
          <Textarea
            placeholder="Additional notes (optional)"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={2}
          />
        </CardContent>
      </Card>

      {/* Section 4: Mood */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How are you feeling?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {moods.map((m) => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                  mood === m.value
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <span className="text-2xl">{m.emoji}</span>
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button onClick={handleSubmit} disabled={submitting || !allResolved} className="w-full" size="lg">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Submit Standup
      </Button>
    </div>
  );
}
