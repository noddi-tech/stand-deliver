import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityBadgeRow {
  id: string;
  activity_id: string;
  source_type: string;
  team_id: string;
  badge_key: string;
  badge_source: string;
  confidence: number;
  manual_override: boolean;
}

export function useActivityBadges(activityIds: string[]) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["activity-badges", activityIds],
    enabled: activityIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // Supabase .in() has a limit; batch if needed
      const all: ActivityBadgeRow[] = [];
      for (let i = 0; i < activityIds.length; i += 200) {
        const batch = activityIds.slice(i, i + 200);
        const { data } = await supabase
          .from("activity_badges")
          .select("*")
          .in("activity_id", batch);
        if (data) all.push(...(data as unknown as ActivityBadgeRow[]));
      }

      const lookup: Record<string, { badgeKey: string; badgeSource: string }> = {};
      for (const row of all) {
        lookup[row.activity_id] = { badgeKey: row.badge_key, badgeSource: row.badge_source };
      }
      return lookup;
    },
  });

  const overrideMutation = useMutation({
    mutationFn: async (params: {
      activityId: string;
      sourceType: string;
      badgeKey: string;
      teamId: string;
    }) => {
      const { error } = await supabase.from("activity_badges").upsert(
        {
          activity_id: params.activityId,
          source_type: params.sourceType,
          team_id: params.teamId,
          badge_key: params.badgeKey,
          badge_source: "manual",
          confidence: 1.0,
          manual_override: true,
        },
        { onConflict: "activity_id,source_type" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-badges"] });
    },
  });

  return {
    badgeLookup: query.data || {},
    isLoading: query.isLoading,
    overrideBadge: overrideMutation.mutate,
  };
}
