import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to Supabase Realtime changes on key tables and
 * auto-invalidates React Query caches so the Dashboard stays fresh.
 */
export function useRealtimeInvalidation(teamId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!teamId) return;

    const channel = supabase
      .channel(`dashboard-realtime-${teamId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "external_activity",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["recent-activity", teamId] });
          qc.invalidateQueries({ queryKey: ["contribution-classification", teamId] });
          qc.invalidateQueries({ queryKey: ["team-metrics", teamId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "impact_classifications",
          filter: `team_id=eq.${teamId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["contribution-classification", teamId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "standup_responses",
        },
        () => {
          // standup_responses doesn't have team_id, so we invalidate broadly
          qc.invalidateQueries({ queryKey: ["team-metrics", teamId] });
          qc.invalidateQueries({ queryKey: ["attention-items", teamId] });
          qc.invalidateQueries({ queryKey: ["recent-activity", teamId] });
          qc.invalidateQueries({ queryKey: ["today-session"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, qc]);
}
