import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

export function useSkipStandup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, teamId }: { memberId: string; teamId: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");

      // Ensure session exists
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

      // Check if already responded
      const { data: existing } = await supabase
        .from("standup_responses")
        .select("id")
        .eq("session_id", sessionId)
        .eq("member_id", memberId)
        .maybeSingle();

      if (existing) throw new Error("Already submitted today");

      // Insert skip response
      const { error } = await supabase.from("standup_responses").insert({
        session_id: sessionId,
        member_id: memberId,
        yesterday_text: "Skipped",
        submitted_via: "web",
        mood: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Standup skipped for today ⏭️");
      queryClient.invalidateQueries({ queryKey: ["today-session"] });
      queryClient.invalidateQueries({ queryKey: ["existing-response-today"] });
      queryClient.invalidateQueries({ queryKey: ["team-members-status"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to skip standup");
    },
  });
}
