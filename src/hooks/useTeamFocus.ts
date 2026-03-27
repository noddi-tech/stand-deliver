import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamFocusItem {
  id: string;
  team_id: string;
  title: string;
  label: string;
  description: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityClassification {
  externalId: string;
  focusLabel: string;
  rationale: string;
  memberId: string;
}

export interface MemberValueBreakdown {
  memberName: string;
  memberId: string;
  breakdown: Record<string, number>; // label -> percentage, includes "Unaligned"
}

export interface ClassificationResult {
  memberBreakdowns: MemberValueBreakdown[];
  classifications: ActivityClassification[];
  generatedAt: string;
}

export interface ReclassifyProgress {
  processed: number;
  total: number;
  classified: number;
  status: "idle" | "running" | "done" | "error";
}

export type ReclassifyMode = "incremental" | "full";

export function useTeamFocusItems(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-focus", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_focus" as any)
        .select("*")
        .eq("team_id", teamId!)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TeamFocusItem[];
    },
  });
}

export function useAllTeamFocusItems(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-focus-all", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_focus" as any)
        .select("*")
        .eq("team_id", teamId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TeamFocusItem[];
    },
  });
}

export function useAddFocusItem(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { title: string; label: string; description?: string; starts_at?: string | null; ends_at?: string | null; parent_id?: string | null }) => {
      const { data, error } = await supabase
        .from("team_focus" as any)
        .insert({ team_id: teamId!, ...item } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-focus", teamId] });
      qc.invalidateQueries({ queryKey: ["team-focus-all", teamId] });
    },
  });
}

export function useUpdateFocusItem(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; label?: string; description?: string; is_active?: boolean; starts_at?: string | null; ends_at?: string | null; parent_id?: string | null }) => {
      const { error } = await supabase
        .from("team_focus" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-focus", teamId] });
      qc.invalidateQueries({ queryKey: ["team-focus-all", teamId] });
    },
  });
}

export function useDeleteFocusItem(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_focus" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-focus", teamId] });
      qc.invalidateQueries({ queryKey: ["team-focus-all", teamId] });
    },
  });
}


export function useReclassifyContributions(teamId: string | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ReclassifyProgress>({
    processed: 0, total: 0, classified: 0, status: "idle",
  });
  const jobIdRef = useRef<string | null>(null);

  // On mount, check for any running job for this team
  useEffect(() => {
    if (!teamId) return;
    const checkExisting = async () => {
      const { data } = await supabase
        .from("reclassification_jobs" as any)
        .select("id, status, processed, total, classified, error_message")
        .eq("team_id", teamId)
        .in("status", ["pending", "running"] as any)
        .order("created_at", { ascending: false })
        .limit(1);
      const jobs = (data || []) as any[];
      if (jobs.length > 0) {
        const job = jobs[0];
        jobIdRef.current = job.id;
        setProgress({
          processed: job.processed || 0,
          total: job.total || 0,
          classified: job.classified || 0,
          status: job.status === "pending" ? "running" : "running",
        });
      }
    };
    checkExisting();
  }, [teamId]);

  // Subscribe to Realtime changes on the active job
  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`reclassify-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reclassification_jobs",
          filter: `team_id=eq.${teamId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row) return;
          // Only track our active job or the latest one
          if (jobIdRef.current && row.id !== jobIdRef.current) return;

          if (row.status === "complete" || row.status === "failed") {
            setProgress({
              processed: row.processed || 0,
              total: row.total || 0,
              classified: row.classified || 0,
              status: row.status === "complete" ? "done" : "error",
            });
            jobIdRef.current = null;
            // Invalidate related queries
            qc.invalidateQueries({ queryKey: ["contribution-classification", teamId] });
          } else {
            setProgress({
              processed: row.processed || 0,
              total: row.total || 0,
              classified: row.classified || 0,
              status: "running",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, qc]);

  const mutation = useMutation({
    mutationFn: async (opts?: { mode?: ReclassifyMode }) => {
      const mode = opts?.mode ?? "incremental";
      if (!teamId) throw new Error("No team");

      setProgress({ processed: 0, total: 0, classified: 0, status: "running" });

      const { data, error } = await supabase.functions.invoke("reclassify-contributions", {
        body: { team_id: teamId, mode },
      });

      if (error) throw error;
      jobIdRef.current = data?.job_id || null;
      return { jobId: data?.job_id };
    },
  });

  const resetProgress = useCallback(() => {
    setProgress({ processed: 0, total: 0, classified: 0, status: "idle" });
    jobIdRef.current = null;
  }, []);

  return { ...mutation, progress, resetProgress };
}

export function useContributionClassification(teamId: string | undefined, enabled = true, periodDays = 7) {
  return useQuery({
    queryKey: ["contribution-classification", teamId, periodDays],
    enabled: !!teamId && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // First fetch recent activity IDs (by occurred_at) to use as the recency filter
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - periodDays);
      const sinceISO = sinceDate.toISOString();

      // Fetch recent external_activity IDs
      const { data: recentExt } = await supabase
        .from("external_activity")
        .select("id")
        .eq("team_id", teamId!)
        .gte("occurred_at", sinceISO);

      // Fetch recent commitment IDs
      const { data: recentCom } = await supabase
        .from("commitments")
        .select("id")
        .eq("team_id", teamId!)
        .gte("created_at", sinceISO);

      const recentIds = [
        ...((recentExt || []).map((r) => r.id)),
        ...((recentCom || []).map((r) => r.id)),
      ];

      if (recentIds.length === 0) {
        return { memberBreakdowns: [], classifications: [], generatedAt: new Date().toISOString() } as ClassificationResult;
      }

      // Fetch classifications for those recent activity IDs (chunked)
      const allClassifications: any[] = [];
      for (let i = 0; i < recentIds.length; i += 500) {
        const chunk = recentIds.slice(i, i + 500);
        const { data: classifications, error } = await supabase
          .from("impact_classifications" as any)
          .select("activity_id, member_id, value_type, focus_alignment, focus_item_id, reasoning, impact_tier")
          .eq("team_id", teamId!)
          .in("activity_id", chunk as any);
        if (error) throw error;
        allClassifications.push(...((classifications || []) as any[]));
      }

      // Fetch team members to map member_id -> name
      const { data: members } = await supabase
        .from("team_members")
        .select("id, profile:profiles!inner(full_name)")
        .eq("team_id", teamId!)
        .eq("is_active", true);

      const memberNameMap = new Map<string, string>();
      for (const m of (members || []) as any[]) {
        memberNameMap.set(m.id, m.profile?.full_name || "Unknown");
      }

      // Fetch focus items to map focus_item_id -> title
      const { data: focusItems } = await supabase
        .from("team_focus" as any)
        .select("id, title, parent_id")
        .eq("team_id", teamId!)
        .eq("is_active", true);

      const focusLabelMap = new Map<string, string>();
      const focusParentMap = new Map<string, string | null>();
      for (const f of (focusItems || []) as any[]) {
        focusLabelMap.set(f.id, f.title);
        focusParentMap.set(f.id, f.parent_id || null);
      }

      // Build per-member breakdowns
      const memberTotals = new Map<string, Map<string, number>>();
      const activityClassifications: ActivityClassification[] = [];

      for (const c of allClassifications) {
        const label = c.focus_item_id && focusLabelMap.has(c.focus_item_id)
          ? focusLabelMap.get(c.focus_item_id)!
          : "Unaligned";
        activityClassifications.push({
          externalId: c.activity_id,
          focusLabel: label,
          rationale: c.reasoning || "",
          memberId: c.member_id,
        });

        if (!memberTotals.has(c.member_id)) {
          memberTotals.set(c.member_id, new Map());
        }
        const breakdown = memberTotals.get(c.member_id)!;
        breakdown.set(label, (breakdown.get(label) || 0) + 1);
      }

      // Convert to percentage breakdowns
      const memberBreakdowns: MemberValueBreakdown[] = [];
      for (const [memberId, labelCounts] of memberTotals) {
        const total = Array.from(labelCounts.values()).reduce((a, b) => a + b, 0);
        const breakdown: Record<string, number> = {};
        for (const [label, count] of labelCounts) {
          breakdown[label] = total > 0 ? Math.round((count / total) * 100) : 0;
        }
        memberBreakdowns.push({
          memberName: memberNameMap.get(memberId) || "Unknown",
          memberId,
          breakdown,
        });
      }

      return {
        memberBreakdowns,
        classifications: activityClassifications,
        generatedAt: new Date().toISOString(),
      } as ClassificationResult;
    },
  });
}
