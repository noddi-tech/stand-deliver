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

export function useReclassifyContributions(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("No team");
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const since = fourteenDaysAgo.toISOString();

      // Fetch recent external_activity
      const { data: extData } = await supabase
        .from("external_activity")
        .select("id, source, activity_type, title, member_id, metadata")
        .eq("team_id", teamId)
        .gte("occurred_at", since);

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

      for (const e of extData || []) {
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

      if (items.length === 0) return { classified: 0 };

      // Send in batches of 20, abort on credit/rate errors
      let totalClassified = 0;
      for (let i = 0; i < items.length; i += 20) {
        const batch = items.slice(i, i + 20);
        const { data, error } = await supabase.functions.invoke("ai-classify-contributions", {
          body: { team_id: teamId, items: batch },
        });
        if (error) {
          // Check for 402/429 returned as FunctionsHttpError
          const status = (error as any)?.context?.status;
          if (status === 402) {
            throw new Error("AI credits exhausted. Please add credits in Settings → Workspace → Usage.");
          }
          if (status === 429) {
            throw new Error("AI rate limit reached. Please try again in a minute.");
          }
          console.error("Reclassify batch error:", error);
        } else {
          // The edge function may return an error object in the body for 402/429
          if (data?.error) {
            if (data.error.includes("credits")) {
              throw new Error("AI credits exhausted. Please add credits in Settings → Workspace → Usage.");
            }
            if (data.error.includes("Rate")) {
              throw new Error("AI rate limit reached. Please try again in a minute.");
            }
          }
          totalClassified += data?.classified || 0;
        }
      }

      return { classified: totalClassified };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contribution-classification", teamId] });
    },
  });
}

export function useContributionClassification(teamId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["contribution-classification", teamId],
    enabled: !!teamId && enabled,
    staleTime: 5 * 60 * 1000, // 5 min — reads stored data, not AI calls
    queryFn: async () => {
      // Fetch recent classifications from the table (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: classifications, error } = await supabase
        .from("impact_classifications" as any)
        .select("activity_id, member_id, value_type, focus_alignment, focus_item_id, reasoning, impact_tier")
        .eq("team_id", teamId!)
        .gte("created_at", sevenDaysAgo.toISOString());

      if (error) throw error;
      const items = (classifications || []) as any[];

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

      // Fetch focus items to map focus_item_id -> label
      const { data: focusItems } = await supabase
        .from("team_focus" as any)
        .select("id, label")
        .eq("team_id", teamId!)
        .eq("is_active", true);

      const focusLabelMap = new Map<string, string>();
      for (const f of (focusItems || []) as any[]) {
        focusLabelMap.set(f.id, f.label);
      }

      // Build per-member breakdowns
      const memberTotals = new Map<string, Map<string, number>>();
      const activityClassifications: ActivityClassification[] = [];

      for (const c of items) {
        const label = c.focus_item_id && focusLabelMap.has(c.focus_item_id)
          ? focusLabelMap.get(c.focus_item_id)!
          : "Unaligned";
        activityClassifications.push({
          externalId: c.activity_id,
          focusLabel: label,
          rationale: c.reasoning || "",
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
