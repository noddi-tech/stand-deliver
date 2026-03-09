import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { format, formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, Check, X, AlertTriangle, Loader2, Plus, ArrowRight, Clock, Edit2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StandupCoachCard, type CoachSuggestion } from "@/components/ai/StandupCoachCard";
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
  existingId?: string; // If editing an existing commitment
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
  const [submitted, setSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [existingResponseId, setExistingResponseId] = useState<string | null>(null);

  // Blocked reason state
  const [blockedInputId, setBlockedInputId] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState("");

  // Drop dialog state
  const [dropDialogId, setDropDialogId] = useState<string | null>(null);
  const [dropReason, setDropReason] = useState("");

  // Editing state for today's commitments
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  // AI Coach state
  const [showCoach, setShowCoach] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachSuggestions, setCoachSuggestions] = useState<CoachSuggestion[]>([]);
  const [coachTip, setCoachTip] = useState<string | null>(null);

  // Fetch today's existing response
  const { data: existingResponse, isLoading: existingLoading } = useQuery({
    queryKey: ["existing-response-today", memberId, teamId],
    enabled: !!memberId && !!teamId,
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      
      // Find today's session
      const { data: session } = await supabase
        .from("standup_sessions")
        .select("id")
        .eq("team_id", teamId!)
        .eq("session_date", today)
        .maybeSingle();
      
      if (!session) return null;

      // Find this member's response
      const { data: response } = await supabase
        .from("standup_responses")
        .select("*")
        .eq("session_id", session.id)
        .eq("member_id", memberId!)
        .maybeSingle();
      
      if (!response) return null;

      // Fetch commitments for this session by this member
      const { data: commitments } = await supabase
        .from("commitments")
        .select("*")
        .eq("member_id", memberId!)
        .eq("origin_session_id", session.id)
        .order("created_at", { ascending: true });

      return {
        response,
        commitments: commitments || [],
        sessionId: session.id,
      };
    },
  });

  // Set submitted state when existing response is found
  useEffect(() => {
    if (existingResponse && !isEditing) {
      setSubmitted(true);
      setExistingResponseId(existingResponse.response.id);
      // Populate form state from DB for the summary view
      setMood(existingResponse.response.mood);
      setBlockersText(existingResponse.response.blockers_text || "");
      setNotesText(existingResponse.response.notes || "");
      setTodayCommitments(
        existingResponse.commitments.map((c) => ({
          title: c.title,
          priority: c.priority,
          existingId: c.id,
        }))
      );
    }
  }, [existingResponse, isEditing]);

  // Fetch previous commitments (not from today's session)
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
  const [blockedReasons, setBlockedReasons] = useState<Record<string, string>>({});
  // Track fading items
  const [fadingIds, setFadingIds] = useState<Set<string>>(new Set());

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
    mutationFn: async ({ id, status, blocked_reason, resolution_note }: { id: string; status: CommitmentStatus; blocked_reason?: string; resolution_note?: string }) => {
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === "done" || status === "dropped") {
        updates.resolved_at = new Date().toISOString();
      }
      if (blocked_reason) updates.blocked_reason = blocked_reason;
      if (resolution_note) updates.resolution_note = resolution_note;
      const { error } = await supabase.from("commitments").update(updates).eq("id", id);
      if (error) throw error;
    },
  });

  const handleStatusChange = (id: string, status: CommitmentStatus) => {
    if (status === "blocked") {
      setBlockedInputId(id);
      setBlockedReason("");
      return;
    }
    if (status === "dropped") {
      setDropDialogId(id);
      setDropReason("");
      return;
    }
    applyStatus(id, status);
  };

  const applyStatus = (id: string, status: CommitmentStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: status }));
    if (status === "done" || status === "dropped") {
      setFadingIds((prev) => new Set(prev).add(id));
    }
  };

  const confirmBlocked = (id: string) => {
    setBlockedReasons((prev) => ({ ...prev, [id]: blockedReason }));
    applyStatus(id, "blocked");
    setBlockedInputId(null);
  };

  const confirmDrop = () => {
    if (!dropDialogId) return;
    applyStatus(dropDialogId, "dropped");
    setDropDialogId(null);
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

  const startEditing = (idx: number) => {
    setEditingIdx(idx);
    setEditingText(todayCommitments[idx].title);
  };

  const saveEditing = () => {
    if (editingIdx === null) return;
    setTodayCommitments((prev) =>
      prev.map((c, i) => (i === editingIdx ? { ...c, title: editingText.trim() || c.title } : c))
    );
    setEditingIdx(null);
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
        await updateCommitmentMutation.mutateAsync({
          id,
          status,
          blocked_reason: blockedReasons[id],
          resolution_note: status === "dropped" ? dropReason : undefined,
        });
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

      // Carry forward stale active/in_progress commitments
      await supabase.rpc('carry_forward_commitments', {
        p_team_id: teamId,
        p_session_id: sessionId,
      });

      const responseData = {
        mood,
        today_text: todayCommitments.map((c) => c.title).join("\n"),
        yesterday_text: previousCommitments.map((c) => `${c.title} → ${effectiveStatuses[c.id]}`).join("\n"),
        blockers_text: blockersText || null,
        notes: notesText || null,
        submitted_via: "web" as const,
      };

      if (existingResponseId) {
        // UPDATE existing response
        const { error: respError } = await supabase
          .from("standup_responses")
          .update(responseData)
          .eq("id", existingResponseId);
        if (respError) throw respError;
      } else {
        // INSERT new response
        const { error: respError } = await supabase.from("standup_responses").insert({
          session_id: sessionId,
          member_id: memberId,
          ...responseData,
        });
        if (respError) throw respError;
      }

      // Handle commitments: mark removed ones as dropped, update existing, insert new
      if (existingResponseId && existingResponse) {
        const previousCommitmentIds = existingResponse.commitments.map((c) => c.id);
        const currentExistingIds = todayCommitments
          .filter((c) => c.existingId)
          .map((c) => c.existingId!);
        
        // Mark removed commitments as dropped
        const removedIds = previousCommitmentIds.filter((id) => !currentExistingIds.includes(id));
        for (const id of removedIds) {
          await supabase.from("commitments").update({
            status: "dropped",
            resolution_note: "Removed during standup edit",
            resolved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", id);
        }

        // Update existing commitments (title/priority may have changed)
        for (const c of todayCommitments.filter((c) => c.existingId)) {
          await supabase.from("commitments").update({
            title: c.title,
            priority: c.priority,
            updated_at: new Date().toISOString(),
          }).eq("id", c.existingId!);
        }

        // Insert new commitments (ones without existingId)
        for (const c of todayCommitments.filter((c) => !c.existingId)) {
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
      } else {
        // Fresh submit — insert all commitments
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
      }

      toast.success(existingResponseId ? "Standup updated! ✏️" : "Standup submitted! 🎉");
      queryClient.invalidateQueries({ queryKey: ["previous-commitments"] });
      queryClient.invalidateQueries({ queryKey: ["existing-response-today"] });
      setSubmitted(true);
      setIsEditing(false);

      // Fire-and-forget: post summary to Slack if channel is configured
      supabase
        .from("teams")
        .select("slack_channel_id")
        .eq("id", teamId)
        .single()
        .then(({ data: team }) => {
          if (team?.slack_channel_id) {
            supabase.functions
              .invoke("slack-post-summary", { body: { session_id: sessionId } })
              .then(({ error }) => {
                if (error) console.error("Failed to post Slack summary:", error);
              });
          }
        });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit standup");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditMode = () => {
    if (!existingResponse) return;
    // Load existing data into form
    setMood(existingResponse.response.mood);
    setBlockersText(existingResponse.response.blockers_text || "");
    setNotesText(existingResponse.response.notes || "");
    setTodayCommitments(
      existingResponse.commitments.map((c) => ({
        title: c.title,
        priority: c.priority,
        existingId: c.id,
      }))
    );
    setIsEditing(true);
    setSubmitted(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setSubmitted(true);
    // Restore from DB
    if (existingResponse) {
      setMood(existingResponse.response.mood);
      setBlockersText(existingResponse.response.blockers_text || "");
      setNotesText(existingResponse.response.notes || "");
      setTodayCommitments(
        existingResponse.commitments.map((c) => ({
          title: c.title,
          priority: c.priority,
          existingId: c.id,
        }))
      );
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setIsEditing(false);
    setExistingResponseId(null);
    setStatusOverrides({});
    setBlockedReasons({});
    setFadingIds(new Set());
    setTodayCommitments([]);
    setBlockersText("");
    setNotesText("");
    setMood(null);
  };

  if (teamLoading || commitmentsLoading || existingLoading) {
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

  // Post-submit read-only view
  if (submitted && !isEditing) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Standup Submitted ✅</h1>
          <Button variant="outline" size="sm" onClick={startEditMode}>
            <Edit2 className="h-4 w-4 mr-1" /> Edit
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            {previousCommitments.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-1">Resolved Items</h3>
                <div className="space-y-1">
                  {previousCommitments.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-[10px]">{effectiveStatuses[c.id] || c.status}</Badge>
                      <span className="text-foreground">{c.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold text-muted-foreground mb-1">Today's Focus</h3>
              <div className="space-y-1">
                {todayCommitments.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline" className={`text-[10px] ${priorityColors[c.priority]}`}>{c.priority}</Badge>
                    <span className="text-foreground">{c.title}</span>
                  </div>
                ))}
              </div>
            </div>

            {blockersText && (
              <div>
                <h3 className="text-xs font-semibold text-destructive mb-1">Blockers</h3>
                <p className="text-sm text-foreground/80 whitespace-pre-line">{blockersText}</p>
              </div>
            )}

            {mood && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground mb-1">Mood</h3>
                <span className="text-lg">{moods.find((m) => m.value === mood)?.emoji} {moods.find((m) => m.value === mood)?.label}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {isEditing ? "Edit Standup" : "My Standup"}
        </h1>
        {isEditing && (
          <Button variant="ghost" size="sm" onClick={cancelEdit}>
            Cancel
          </Button>
        )}
      </div>

      {/* Section 1: Resolve Previous Commitments */}
      {!isEditing && (
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
              <EmptyState
                icon={CheckCircle2}
                title="All clear!"
                description="No items to resolve."
                iconClassName="text-emerald-500/60"
              />
            )}
            {previousCommitments.map((c) => {
              const current = effectiveStatuses[c.id];
              const isResolved = current === "done" || current === "dropped";
              const isFading = fadingIds.has(c.id);
              return (
                <div key={c.id} className="space-y-2">
                  <div
                    className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-opacity duration-300 ${
                      isFading ? "opacity-40" : isResolved ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${isResolved ? "line-through" : ""}`}>
                          {c.title}
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${priorityColors[c.priority]}`}>
                          {c.priority}
                        </Badge>
                        {c.carry_count > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            carried {c.carry_count}x {c.carry_count >= 2 ? "⚠️" : ""}
                          </Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
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
                  {/* Inline blocked reason input */}
                  {blockedInputId === c.id && (
                    <div className="flex gap-2 pl-3">
                      <Input
                        placeholder="What's blocking you?"
                        value={blockedReason}
                        onChange={(e) => setBlockedReason(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && confirmBlocked(c.id)}
                        className="flex-1 h-8 text-sm"
                        autoFocus
                      />
                      <Button size="sm" className="h-8" onClick={() => confirmBlocked(c.id)}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setBlockedInputId(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Section 2: Today's Focus */}
      <Card className={`transition-opacity duration-300 ${!isEditing && !allResolved ? "opacity-50" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {!isEditing && !allResolved && <Lock className="h-4 w-4 text-muted-foreground" />}
            Today's Focus
          </CardTitle>
          {!isEditing && !allResolved && (
            <p className="text-xs text-muted-foreground">
              Resolve all previous commitments to unlock this section
            </p>
          )}
        </CardHeader>
        <CardContent className={`space-y-3 ${!isEditing && !allResolved ? "pointer-events-none" : ""}`}>
          {(isEditing || allResolved) && (
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
                  {editingIdx === i ? (
                    <Input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={saveEditing}
                      onKeyDown={(e) => e.key === "Enter" && saveEditing()}
                      className="flex-1 h-7 text-sm"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm cursor-pointer hover:text-primary"
                      onClick={() => startEditing(i)}
                    >
                      {c.title}
                    </span>
                  )}
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
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30 scale-110"
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
      <Button onClick={handleSubmit} disabled={submitting || (!isEditing && !allResolved)} className="w-full" size="lg">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {isEditing ? "Update Standup" : "Submit Standup"}
      </Button>

      {/* Drop confirmation dialog */}
      <AlertDialog open={!!dropDialogId} onOpenChange={(open) => !open && setDropDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop this commitment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the item as dropped. You can optionally provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={dropReason}
            onChange={(e) => setDropReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDrop}>Drop Item</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
