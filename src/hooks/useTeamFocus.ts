import { useState, useCallback, useRef } from "react";
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
    mutationFn: async (item: { title: string; label: string; description?: string; starts_at?: string | null; ends_at?: string | null }) => {
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
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; label?: string; description?: string; is_active?: boolean; starts_at?: string | null; ends_at?: string | null }) => {
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

/** Paginated fetch that bypasses Supabase 1000-row limit */
async function fetchAllPaginated<T>(
  query: () => ReturnType<ReturnType<typeof supabase.from>["select"]>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (query() as any).range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function useReclassifyContributions(teamId: string | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ReclassifyProgress>({
    processed: 0, total: 0, classified: 0, status: "idle",
  });
  const abortRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (opts?: { mode?: ReclassifyMode }) => {
      const mode = opts?.mode ?? "incremental";
      if (!teamId) throw new Error("No team");
      abortRef.current = false;

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const since = fourteenDaysAgo.toISOString();

      const parseDegradedMessage = (message: string) => {
        const normalized = message.toLowerCase();
        if (normalized.includes("credit")) {
          return { reason: "credits_exhausted" as const, message: "AI credits exhausted. Add credits in Settings → Workspace → Usage." };
        }
        if (normalized.includes("rate")) {
          return { reason: "rate_limited" as const, message: "AI rate limit reached. Please try again in a minute." };
        }
        return null;
      };

      // Fetch recent external_activity with pagination
      const extData = await fetchAllPaginated<any>(() =>
        supabase
          .from("external_activity")
          .select("id, source, activity_type, title, member_id, metadata")
          .eq("team_id", teamId)
          .gte("occurred_at", since)
      );

      // Fetch recent commitments
      const { data: commitData } = await supabase
        .from("commitments")
        .select("id, title, description, member_id")
        .eq("team_id", teamId)
        .gte("created_at", since);

      const items: Array<{
        id: string;
        source_type: string;
        source?: string;
        activity_type?: string;
        title: string;
        description?: string;
        metadata?: Record<string, any>;
        member_id: string;
      }> = [];

      for (const e of extData) {
        items.push({
          id: e.id,
          source_type: "external_activity",
          source: e.source,
          activity_type: e.activity_type,
          title: e.title,
          member_id: e.member_id,
          metadata: e.metadata as Record<string, any> | undefined,
        });
      }
      for (const c of commitData || []) {
        items.push({
          id: c.id,
          source_type: "commitment",
          title: c.title,
          description: c.description || undefined,
          member_id: c.member_id,
        });
      }

      if (items.length === 0) {
        setProgress({ processed: 0, total: 0, classified: 0, status: "done" });
        return { classified: 0 };
      }

      let itemsToProcess = items;

      if (mode === "incremental") {
        // Filter out already-classified items
        const allIds = items.map((it) => it.id);
        // Chunk IDs to avoid too-large IN clauses
        const classifiedIds = new Set<string>();
        for (let i = 0; i < allIds.length; i += 500) {
          const chunk = allIds.slice(i, i + 500);
          const { data: existingClassifications } = await supabase
            .from("impact_classifications" as any)
            .select("activity_id")
            .eq("team_id", teamId)
            .in("activity_id", chunk as any);
          for (const c of (existingClassifications || []) as any[]) {
            classifiedIds.add(c.activity_id);
          }
        }
        itemsToProcess = items.filter((it) => !classifiedIds.has(it.id));

        if (itemsToProcess.length === 0) {
          setProgress({ processed: 0, total: 0, classified: 0, status: "done" });
          return { classified: 0, skipped: items.length };
        }
      }

      // Initialize progress
      setProgress({ processed: 0, total: itemsToProcess.length, classified: 0, status: "running" });

      // Send in batches of 20
      let totalClassified = 0;
      let degraded: { reason: "credits_exhausted" | "rate_limited"; message: string } | null = null;

      for (let i = 0; i < itemsToProcess.length; i += 20) {
        if (abortRef.current) break;
        const batch = itemsToProcess.slice(i, i + 20);
        const { data, error } = await supabase.functions.invoke("ai-classify-contributions", {
          body: { team_id: teamId, items: batch },
        });

        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402 || status === 429) {
            degraded = {
              reason: status === 402 ? "credits_exhausted" : "rate_limited",
              message: status === 402
                ? "AI credits exhausted. Add credits in Settings → Workspace → Usage."
                : "AI rate limit reached. Please try again in a minute.",
            };
            break;
          }
          console.error("Reclassify batch error:", error);
          setProgress((p) => ({ ...p, status: "error" }));
          throw error;
        }

        if (data?.degraded?.reason === "credits_exhausted" || data?.degraded?.reason === "rate_limited") {
          degraded = {
            reason: data.degraded.reason,
            message: data.degraded.message || (data.degraded.reason === "credits_exhausted"
              ? "AI credits exhausted. Add credits in Settings → Workspace → Usage."
              : "AI rate limit reached. Please try again in a minute."),
          };
          break;
        }

        if (typeof data?.error === "string") {
          const parsed = parseDegradedMessage(data.error);
          if (parsed) {
            degraded = parsed;
            break;
          }
          setProgress((p) => ({ ...p, status: "error" }));
          throw new Error(data.error);
        }

        const batchClassified = Number(data?.classified || 0);
        totalClassified += batchClassified;
        setProgress((p) => ({
          ...p,
          processed: Math.min(p.processed + batch.length, p.total),
          classified: p.classified + batchClassified,
        }));
      }

      setProgress((p) => ({ ...p, status: "done" }));

      return degraded
        ? { classified: totalClassified, degraded }
        : { classified: totalClassified };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-classification", teamId] });
    },
  });

  const resetProgress = useCallback(() => {
    setProgress({ processed: 0, total: 0, classified: 0, status: "idle" });
  }, []);

  return { ...mutation, progress, resetProgress };
}

export function useContributionClassification(teamId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["contribution-classification", teamId],
    enabled: !!teamId && enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      // First fetch recent activity IDs (by occurred_at) to use as the recency filter
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sinceISO = sevenDaysAgo.toISOString();

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
        .select("id, title")
        .eq("team_id", teamId!)
        .eq("is_active", true);

      const focusLabelMap = new Map<string, string>();
      for (const f of (focusItems || []) as any[]) {
        focusLabelMap.set(f.id, f.title);
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
