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

interface TeamSummaryPayload {
  analysis: TeamAnalysis;
  memberStats: MemberStat[];
}

function getFunctionErrorStatus(error: unknown): number | undefined {
  const status = (error as { context?: { status?: unknown } })?.context?.status;
  if (typeof status === "number") return status;

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("402")) return 402;
  if (message.includes("429")) return 429;
  return undefined;
}

function makeFallbackPayload(teamSummary: string, recommendation: string): TeamSummaryPayload {
  return {
    analysis: {
      teamSummary,
      memberHighlights: [],
      recommendations: [recommendation],
    },
    memberStats: [],
  };
}

function mapErrorToFallback(error: unknown): TeamSummaryPayload | null {
  const status = getFunctionErrorStatus(error);
  if (status === 402) {
    return makeFallbackPayload(
      "AI summary is temporarily unavailable because AI credits are exhausted.",
      "Add credits in Settings → Workspace → Usage, then refresh this page."
    );
  }
  if (status === 429) {
    return makeFallbackPayload(
      "AI summary is temporarily unavailable due to rate limiting.",
      "Wait a minute and refresh to try again."
    );
  }
  return null;
}

export function useTeamSummary(teamId: string | undefined, period = "7d") {
  return useQuery({
    queryKey: ["team-summary", teamId, period],
    enabled: !!teamId,
    staleTime: 30 * 60 * 1000, // 30 min cache - AI calls are expensive
    retry: (failureCount, error) => {
      const status = getFunctionErrorStatus(error);
      if (status === 402 || status === 429) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ai-team-summary", {
        body: { team_id: teamId, period },
      });

      if (error) {
        const fallback = mapErrorToFallback(error);
        if (fallback) return fallback;
        throw error;
      }

      if (typeof data?.error === "string") {
        const lower = data.error.toLowerCase();
        if (lower.includes("credits") || lower.includes("rate limit")) {
          return mapErrorToFallback(new Error(data.error))!;
        }
        throw new Error(data.error);
      }

      return (data || makeFallbackPayload("No team summary available yet.", "Try refreshing in a moment.")) as TeamSummaryPayload;
    },
  });
}
