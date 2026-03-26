import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ============================================================
// Types
// ============================================================

export interface FocusRetrospective {
  id: string;
  focus_item_id: string;
  team_id: string;
  status: "pending" | "generating" | "complete" | "failed";
  metrics: Record<string, any>;
  ai_narrative: string | null;
  ai_recommendations: any[];
  completed_by: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GapSuggestion {
  suggestion_id: string;
  title: string;
  description: string;
  type: "deferred" | "blocker" | "capacity" | "improvement" | "new";
  priority: "high" | "medium" | "low";
  source?: string;
  accepted: boolean | null;
}

export interface FocusGapAnalysis {
  id: string;
  v1_focus_id: string;
  v2_focus_id: string;
  team_id: string;
  suggestions: GapSuggestion[];
  created_at: string;
}

export interface FocusInsight {
  id: string;
  team_id: string;
  focus_item_id: string | null;
  insight_type: string;
  title: string;
  description: string;
  confidence: number;
  is_dismissed: boolean;
  created_at: string;
}

export interface SimilarFocusArea {
  id: string;
  title: string;
  description: string | null;
  label: string;
  completed_at: string;
  similarity: number;
}

// ============================================================
// useCompleteFocusArea
// Sets completed_at + is_active = false instantly, creates focus_retrospectives
// row with status 'pending', invokes ai-focus-retrospective fire-and-forget.
// ============================================================

export function useCompleteFocusArea(teamId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (focusItemId: string) => {
      if (!teamId) throw new Error("No team");

      // 1. Instant completion: set completed_at and is_active = false
      const now = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("team_focus" as any)
        .update({ is_active: false, completed_at: now, updated_at: now } as any)
        .eq("id", focusItemId);
      if (updateErr) throw updateErr;

      // 2. Create retrospective row with status 'pending' via edge function
      // (service_role handles the insert since no INSERT RLS for authenticated)
      // We'll invoke the retrospective edge function which creates its own row
      const { data, error } = await supabase.functions.invoke("ai-focus-retrospective", {
        body: { focus_item_id: focusItemId, team_id: teamId, create_row: true },
      });

      // If the edge function hasn't created the row yet, that's ok - it's async
      return { focusItemId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-focus", teamId] });
      qc.invalidateQueries({ queryKey: ["team-focus-all", teamId] });
      qc.invalidateQueries({ queryKey: ["focus-retrospective"] });
    },
  });
}

// ============================================================
// useFocusRetrospective
// Queries focus_retrospectives with Realtime subscription for status changes.
// ============================================================

export function useFocusRetrospective(focusItemId: string | undefined) {
  const qc = useQueryClient();

  // Subscribe to realtime changes
  useEffect(() => {
    if (!focusItemId) return;

    const channel = supabase
      .channel(`retrospective-${focusItemId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "focus_retrospectives",
          filter: `focus_item_id=eq.${focusItemId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["focus-retrospective", focusItemId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [focusItemId, qc]);

  return useQuery({
    queryKey: ["focus-retrospective", focusItemId],
    enabled: !!focusItemId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("focus_retrospectives" as any)
        .select("*")
        .eq("focus_item_id", focusItemId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as FocusRetrospective | null;
    },
  });
}

// ============================================================
// useSimilarFocusAreas
// Calls find_similar_focus_areas RPC for pg_trgm similarity matching.
// ============================================================

export function useSimilarFocusAreas(teamId: string | undefined, searchText: string, excludeId?: string) {
  return useQuery({
    queryKey: ["similar-focus-areas", teamId, searchText, excludeId],
    enabled: !!teamId && searchText.length >= 3,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_similar_focus_areas" as any, {
        p_team_id: teamId,
        p_search_text: searchText,
        p_exclude_id: excludeId || null,
        p_limit: 5,
      });
      if (error) throw error;
      return (data || []) as unknown as SimilarFocusArea[];
    },
  });
}

// ============================================================
// useCreateFocusV2
// Creates a new focus area with predecessor_id set.
// ============================================================

export function useCreateFocusV2(teamId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      label: string;
      description?: string;
      predecessorId: string;
      starts_at?: string | null;
      ends_at?: string | null;
    }) => {
      if (!teamId) throw new Error("No team");
      const { data, error } = await supabase
        .from("team_focus" as any)
        .insert({
          team_id: teamId,
          title: params.title,
          label: params.label,
          description: params.description || null,
          predecessor_id: params.predecessorId,
          starts_at: params.starts_at || null,
          ends_at: params.ends_at || null,
        } as any)
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

// ============================================================
// useFocusGapAnalysis
// Fetches/creates gap analysis from focus_gap_analyses.
// ============================================================

export function useFocusGapAnalysis(v1Id: string | undefined, v2Id: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ["focus-gap-analysis", v1Id, v2Id],
    enabled: !!v1Id && !!v2Id && !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // First check if one exists
      const { data: existing } = await supabase
        .from("focus_gap_analyses" as any)
        .select("*")
        .eq("v1_focus_id", v1Id!)
        .eq("v2_focus_id", v2Id!)
        .maybeSingle();

      if (existing) return existing as unknown as FocusGapAnalysis;

      // If not, invoke the edge function to create one
      const { data, error } = await supabase.functions.invoke("ai-focus-gap-analysis", {
        body: { v1_focus_id: v1Id, v2_focus_id: v2Id, team_id: teamId },
      });
      if (error) throw error;
      return data as FocusGapAnalysis;
    },
  });
}

// ============================================================
// useUpdateGapSuggestion
// Updates accept/reject by suggestion_id in JSONB.
// ============================================================

export function useUpdateGapSuggestion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      analysisId: string;
      suggestionId: string;
      accepted: boolean;
    }) => {
      // Fetch current suggestions
      const { data: analysis, error: fetchErr } = await supabase
        .from("focus_gap_analyses" as any)
        .select("suggestions")
        .eq("id", params.analysisId)
        .single();
      if (fetchErr) throw fetchErr;

      const suggestions = ((analysis as any)?.suggestions || []).map((s: any) =>
        s.suggestion_id === params.suggestionId
          ? { ...s, accepted: params.accepted }
          : s
      );

      const { error } = await supabase
        .from("focus_gap_analyses" as any)
        .update({ suggestions } as any)
        .eq("id", params.analysisId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["focus-gap-analysis"] });
    },
  });
}

// ============================================================
// useFocusInsights
// Queries focus_insights where is_dismissed = false.
// ============================================================

export function useFocusInsights(teamId: string | undefined) {
  return useQuery({
    queryKey: ["focus-insights", teamId],
    enabled: !!teamId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("focus_insights" as any)
        .select("*")
        .eq("team_id", teamId!)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as FocusInsight[];
    },
  });
}

// ============================================================
// useDismissInsight
// Sets is_dismissed = true on a specific insight.
// ============================================================

export function useDismissInsight(teamId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (insightId: string) => {
      const { error } = await supabase
        .from("focus_insights" as any)
        .update({ is_dismissed: true } as any)
        .eq("id", insightId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["focus-insights", teamId] });
    },
  });
}
