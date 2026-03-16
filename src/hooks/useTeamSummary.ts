import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MemberHighlight {
  name: string;
  sentiment: "strong" | "steady" | "needs_attention";
  highlight: string;
}

export interface TeamAnalysis {
  teamSummary: string;
  memberHighlights: MemberHighlight[];
  recommendations: string[];
}

export interface MemberStat {
  name: string;
  role: string;
  commitments: { total: number; done: number; carried: number; completionRate: number };
  activeBlockers: number;
  standup: { submitted: number; skipped: number; participationRate: number; totalSessions: number };
  externalActivity: { githubCommits: number; prs: number; clickupTasks: number };
}

export function useTeamSummary(teamId: string | undefined, period = "7d") {
  return useQuery({
    queryKey: ["team-summary", teamId, period],
    enabled: !!teamId,
    staleTime: 30 * 60 * 1000, // 30 min cache - AI calls are expensive
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-team-summary", {
        body: { team_id: teamId, period },
      });
      if (error) throw error;
      return data as { analysis: TeamAnalysis; memberStats: MemberStat[] };
    },
  });
}
