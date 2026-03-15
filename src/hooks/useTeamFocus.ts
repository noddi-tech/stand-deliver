import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TeamFocusItem {
  id: string;
  team_id: string;
  title: string;
  label: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityClassification {
  externalId: string;
  focusLabel: string;
  rationale: string;
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
    mutationFn: async (item: { title: string; label: string; description?: string }) => {
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
    mutationFn: async ({ id, ...updates }: { id: string; title?: string; label?: string; description?: string; is_active?: boolean }) => {
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

export function useContributionClassification(teamId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["contribution-classification", teamId],
    enabled: !!teamId && enabled,
    staleTime: 30 * 60 * 1000, // 30 min cache
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-classify-contributions", {
        body: { team_id: teamId },
      });
      if (error) throw error;
      return data as ClassificationResult;
    },
  });
}
