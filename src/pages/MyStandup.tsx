import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserTeam } from "@/hooks/useAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { format, formatDistanceToNow, subDays } from "date-fns";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock, Check, X, AlertTriangle, Loader2, Plus, ArrowRight, Clock, Edit2, CheckCircle2, SquareKanban, GitBranch, ExternalLink, Eye, EyeOff, SkipForward, Sparkles, Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/EmptyState";
import { StandupCoachCard, type CoachSuggestion } from "@/components/ai/StandupCoachCard";
import { useSkipStandup } from "@/hooks/useSkipStandup";
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
  clickup_task_id?: string; // ClickUp task link
}

function SkipTodayButton({ memberId, teamId }: { memberId: string; teamId: string }) {
  const skipMutation = useSkipStandup();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={skipMutation.isPending}
      onClick={() => skipMutation.mutate({ memberId, teamId })}
    >
      <SkipForward className="mr-1 h-4 w-4" />
      Skip Today
    </Button>
  );
}

export default function MyStandup() {
  const { user } = useAuth();
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

  // ClickUp import state
  const [showClickUpDialog, setShowClickUpDialog] = useState(false);
  const [clickUpTasks, setClickUpTasks] = useState<any[]>([]);
  const [selectedClickUpTasks, setSelectedClickUpTasks] = useState<Set<string>>(new Set());
  const [loadingClickUp, setLoadingClickUp] = useState(false);
  const [clickUpSearch, setClickUpSearch] = useState("");
  const [clickUpStatusFilter, setClickUpStatusFilter] = useState<string>("all");

  // AI-powered focus suggestions
  interface FocusSuggestion {
    title: string;
    reason: string;
    priority: "high" | "medium" | "low";
  }
  const [addedSuggestions, setAddedSuggestions] = useState<Set<string>>(new Set());

  const { data: aiSuggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ["ai-focus-suggestions", memberId, teamId],
    enabled: !!memberId && !!teamId && !submitted && !isEditing,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-suggest-focus", {
        body: { member_id: memberId, team_id: teamId },
      });
      if (error) throw error;
      return (data?.suggestions || []) as FocusSuggestion[];
    },
  });

  const addSuggestionToFocus = (suggestion: FocusSuggestion) => {
    setTodayCommitments((prev) => [
      ...prev,
      { title: suggestion.title, priority: suggestion.priority as CommitmentPriority },
    ]);
    setAddedSuggestions((prev) => new Set(prev).add(suggestion.title));
    toast.success(`Added "${suggestion.title}" to today's focus`);
  };

  // Fetch user's org for ClickUp
  const { data: orgMembership } = useQuery({
    queryKey: ["org-membership-standup", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Check if ClickUp is connected
  const { data: clickUpInstallation } = useQuery({
    queryKey: ["clickup-installation-standup", orgMembership?.org_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clickup_installations")
        .select("id")
        .eq("org_id", orgMembership!.org_id)
        .maybeSingle();
      return data;
    },
    enabled: !!orgMembership?.org_id,
  });

  // Check if current user has ClickUp mapping
  const { data: clickUpMapping } = useQuery({
    queryKey: ["clickup-mapping-standup", user?.id, orgMembership?.org_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clickup_user_mappings")
        .select("clickup_member_id")
        .eq("user_id", user!.id)
        .eq("org_id", orgMembership!.org_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !!orgMembership?.org_id && !!clickUpInstallation,
  });

  const canImportFromClickUp = !!clickUpInstallation && !!clickUpMapping;

  const fetchClickUpTasks = async () => {
    if (!orgMembership?.org_id || !user?.id) return;
    setLoadingClickUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("clickup-fetch-tasks", {
        body: { org_id: orgMembership.org_id, user_id: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setClickUpTasks(data?.tasks || []);
      setSelectedClickUpTasks(new Set());
      setShowClickUpDialog(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch ClickUp tasks");
    } finally {
      setLoadingClickUp(false);
    }
  };

  const importSelectedClickUpTasks = () => {
    const tasksToImport = clickUpTasks.filter((t) => selectedClickUpTasks.has(t.id));
    const newCommitments: NewCommitment[] = tasksToImport.map((t) => ({
      title: t.name,
      priority: t.priority === "urgent" || t.priority === "high" ? "high" as CommitmentPriority : t.priority === "low" ? "low" as CommitmentPriority : "medium" as CommitmentPriority,
      clickup_task_id: t.id,
    }));
    setTodayCommitments((prev) => [...prev, ...newCommitments]);
    setShowClickUpDialog(false);
    toast.success(`Imported ${tasksToImport.length} task${tasksToImport.length !== 1 ? "s" : ""} from ClickUp`);
  };

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

  // Count items the user has explicitly addressed (any status change from active/carried counts)
  const addressedCount = Object.values(effectiveStatuses).filter(
    (s) => s === "done" || s === "dropped" || s === "in_progress" || s === "blocked"
  ).length;
  const totalPrevious = previousCommitments.length;
  const allResolved = totalPrevious === 0 || addressedCount === totalPrevious;
  const progressPercent = totalPrevious > 0 ? Math.round((addressedCount / totalPrevious) * 100) : 100;

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

  const requestCoachReview = async () => {
    if (!mood) {
      toast.error("Please select your mood");
      return;
    }
    if (todayCommitments.length === 0) {
      toast.error("Add at least one focus item for today");
      return;
    }
    setCoachLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-coach-standup", {
        body: { commitments: todayCommitments.map((c) => ({ title: c.title })) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setCoachSuggestions(data?.suggestions || []);
      setCoachTip(data?.overall_tip || null);
      setShowCoach(true);
    } catch (err: any) {
      console.error("Coach review failed:", err);
      // Fail gracefully — let them submit without review
      toast.info("AI coach unavailable — you can submit directly");
      try {
        await handleSubmit();
      } catch (submitErr: any) {
        console.error("Submit after coach failure:", submitErr);
        toast.error(submitErr.message || "Failed to submit standup");
      }
    } finally {
      setCoachLoading(false);
    }
  };

  const handleCoachApply = (original: string, rewrite: string) => {
    setTodayCommitments((prev) =>
      prev.map((c) => (c.title === original ? { ...c, title: rewrite } : c))
    );
  };

  const handleCoachDismiss = (_original: string) => {
    // No-op — visual dismiss handled in StandupCoachCard
  };

  const handleCoachApplyAll = () => {
    const actionable = coachSuggestions.filter((s) => s.category !== "good");
    setTodayCommitments((prev) =>
      prev.map((c) => {
        const suggestion = actionable.find((s) => s.original === c.title);
        return suggestion ? { ...c, title: suggestion.rewrite } : c;
      })
    );
    setShowCoach(false);
    toast.success("All suggestions applied!");
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

      // Upsert session first (needed for carry_forward)
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

      // Carry forward FIRST (scoped to this member only), then apply user overrides
      await supabase.rpc('carry_forward_commitments', {
        p_team_id: teamId,
        p_session_id: sessionId,
        p_member_id: memberId,
      });

      // Now apply user's explicit status overrides (these take priority over carry_forward)
      for (const [id, status] of Object.entries(statusOverrides)) {
        await updateCommitmentMutation.mutateAsync({
          id,
          status,
          blocked_reason: blockedReasons[id],
          resolution_note: status === "dropped" ? dropReason : undefined,
        });

        // Fire-and-forget: sync status to ClickUp if linked
        const linkedCommitment = previousCommitments.find((c) => c.id === id);
        if (linkedCommitment?.clickup_task_id && orgMembership?.org_id) {
          supabase.functions
            .invoke("clickup-update-task", {
              body: {
                org_id: orgMembership.org_id,
                clickup_task_id: linkedCommitment.clickup_task_id,
                new_status: status,
              },
            })
            .then(({ error }) => {
              if (error) console.error("ClickUp sync failed:", error);
            });
        }
      }

      const responseData = {
        mood,
        today_text: todayCommitments.map((c) => c.title).join("\n"),
        yesterday_text: previousCommitments.map((c) => `${c.title} → ${effectiveStatuses[c.id]}`).join("\n"),
        blockers_text: blockersText || null,
        notes: notesText || null,
        submitted_via: "web" as const,
      };

      // Upsert response (idempotent — handles both insert and edit)
      const { error: respError } = await supabase
        .from("standup_responses")
        .upsert(
          {
            session_id: sessionId,
            member_id: memberId,
            ...responseData,
          },
          { onConflict: "session_id,member_id" }
        );
      if (respError) throw respError;

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
            clickup_task_id: c.clickup_task_id || null,
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
            clickup_task_id: c.clickup_task_id || null,
          });
          if (error) throw error;
        }
      }

      // Auto-acknowledge unacknowledged external activity for this member
      if (memberId && teamId) {
        supabase
          .from("external_activity")
          .update({ is_acknowledged: true })
          .eq("team_id", teamId)
          .eq("member_id", memberId)
          .eq("is_acknowledged", false)
          .then(({ error: ackErr }) => {
            if (ackErr) console.error("Failed to acknowledge activity:", ackErr);
          });
      }

      toast.success(existingResponseId ? "Standup updated! ✏️" : "Standup submitted! 🎉");
      queryClient.invalidateQueries({ queryKey: ["previous-commitments"] });
      queryClient.invalidateQueries({ queryKey: ["existing-response-today"] });
      setSubmitted(true);
      setIsEditing(false);
      setShowCoach(false);
      setCoachSuggestions([]);
      setCoachTip(null);

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
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
          )}
          {!isEditing && !submitted && memberId && teamId && (
            <SkipTodayButton memberId={memberId} teamId={teamId} />
          )}
        </div>
      </div>

      {/* AI-Powered Focus Suggestions */}
      {!isEditing && !submitted && aiSuggestions && aiSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Suggested Focus
              <Badge variant="secondary" className="gap-1 text-[10px]">AI-powered</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {aiSuggestions.map((suggestion, idx) => {
              const isAdded = addedSuggestions.has(suggestion.title);
              const priorityColor = priorityColors[suggestion.priority as CommitmentPriority] || "";
              return (
                <div key={idx} className={`flex items-start gap-3 rounded-lg border p-3 ${isAdded ? "opacity-50" : ""}`}>
                  <Target className={`h-4 w-4 mt-0.5 shrink-0 ${
                    suggestion.priority === "high" ? "text-destructive" : suggestion.priority === "medium" ? "text-warning-foreground" : "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{suggestion.reason}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${priorityColor}`}>{suggestion.priority}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={isAdded}
                      onClick={() => addSuggestionToFocus(suggestion)}
                    >
                      <Plus className="h-3 w-3 mr-1" /> {isAdded ? "Added" : "Add"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {!isEditing && !submitted && suggestionsLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              Generating focus suggestions…
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </CardContent>
        </Card>
      )}

      {/* Section 1: Resolve Previous Commitments */}
      {!isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Resolve Previous Commitments</span>
              <span className="text-sm font-normal text-muted-foreground">
                {addressedCount} of {totalPrevious} addressed
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
                {canImportFromClickUp && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={fetchClickUpTasks}
                    disabled={loadingClickUp}
                    title="Add from ClickUp"
                  >
                    {loadingClickUp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SquareKanban className="h-4 w-4" />
                    )}
                  </Button>
                )}
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

      {/* AI Coach Review */}
      {showCoach && (
        <StandupCoachCard
          suggestions={coachSuggestions}
          overallTip={coachTip}
          onApply={handleCoachApply}
          onDismiss={handleCoachDismiss}
          onApplyAll={handleCoachApplyAll}
          onSubmitAnyway={() => { setShowCoach(false); handleSubmit(); }}
          submitting={submitting}
        />
      )}

      {/* Submit */}
      {!showCoach && (
        <Button
          onClick={requestCoachReview}
          disabled={submitting || coachLoading || (!isEditing && !allResolved)}
          className="w-full"
          size="lg"
        >
          {(submitting || coachLoading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {coachLoading ? "AI reviewing..." : isEditing ? "Update Standup" : "Submit Standup"}
        </Button>
      )}

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

      {/* ClickUp Task Picker Dialog */}
      <Dialog open={showClickUpDialog} onOpenChange={(open) => {
        setShowClickUpDialog(open);
        if (!open) { setClickUpSearch(""); setClickUpStatusFilter("all"); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SquareKanban className="h-5 w-5" />
              Add from ClickUp
            </DialogTitle>
            <DialogDescription>
              Search and select tasks to add as today's focus items.
            </DialogDescription>
          </DialogHeader>

          {/* Search input */}
          <Input
            placeholder="Search tasks..."
            value={clickUpSearch}
            onChange={(e) => setClickUpSearch(e.target.value)}
            autoFocus
          />

          {/* Status filter chips */}
          {clickUpTasks.length > 0 && (() => {
            const statuses = Array.from(new Set(clickUpTasks.map((t) => t.status?.toLowerCase()))).filter(Boolean);
            return (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setClickUpStatusFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    clickUpStatusFilter === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  All
                </button>
                {statuses.map((s) => (
                  <button
                    key={s}
                    onClick={() => setClickUpStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                      clickUpStatusFilter === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Task list */}
          {(() => {
            const filtered = clickUpTasks.filter((task) => {
              const matchesSearch = !clickUpSearch || task.name.toLowerCase().includes(clickUpSearch.toLowerCase());
              const matchesStatus = clickUpStatusFilter === "all" || task.status?.toLowerCase() === clickUpStatusFilter;
              return matchesSearch && matchesStatus;
            });

            const highlightMatch = (text: string) => {
              if (!clickUpSearch) return text;
              const idx = text.toLowerCase().indexOf(clickUpSearch.toLowerCase());
              if (idx === -1) return text;
              return (
                <>
                  {text.slice(0, idx)}
                  <span className="bg-primary/20 text-primary font-semibold">{text.slice(idx, idx + clickUpSearch.length)}</span>
                  {text.slice(idx + clickUpSearch.length)}
                </>
              );
            };

            return (
              <>
                {/* Result count & select all */}
                {clickUpTasks.length > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{filtered.length} of {clickUpTasks.length} tasks</span>
                    {filtered.length > 0 && filtered.length <= 20 && (
                      <button
                        className="text-primary hover:underline"
                        onClick={() => {
                          const allVisible = filtered.every((t) => selectedClickUpTasks.has(t.id));
                          setSelectedClickUpTasks((prev) => {
                            const next = new Set(prev);
                            filtered.forEach((t) => allVisible ? next.delete(t.id) : next.add(t.id));
                            return next;
                          });
                        }}
                      >
                        {filtered.every((t) => selectedClickUpTasks.has(t.id)) ? "Deselect all" : "Select all"}
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {clickUpTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks found in ClickUp.
                    </p>
                  ) : filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No tasks matching "{clickUpSearch}"
                    </p>
                  ) : (
                    filtered.map((task) => (
                      <label
                        key={task.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedClickUpTasks.has(task.id) ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"
                        }`}
                      >
                        <Checkbox
                          checked={selectedClickUpTasks.has(task.id)}
                          onCheckedChange={(checked) => {
                            setSelectedClickUpTasks((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(task.id);
                              else next.delete(task.id);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{highlightMatch(task.name)}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {task.status}
                            </Badge>
                            {task.list_name && (
                              <span className="text-[10px] text-muted-foreground">
                                {task.list_name}
                              </span>
                            )}
                            {task.priority && (
                              <Badge variant="outline" className="text-[10px]">
                                {task.priority}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            );
          })()}

          {clickUpTasks.length > 0 && (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowClickUpDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={importSelectedClickUpTasks}
                disabled={selectedClickUpTasks.size === 0}
              >
                Add {selectedClickUpTasks.size > 0 ? `${selectedClickUpTasks.size} task${selectedClickUpTasks.size !== 1 ? "s" : ""}` : "tasks"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
