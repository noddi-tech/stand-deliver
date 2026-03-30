import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTeamSchedule(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-schedule", teamId],
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("standup_days, standup_timezone")
        .eq("id", teamId!)
        .single();
      return data as { standup_days: string[]; standup_timezone: string } | null;
    },
  });
}

const DAY_CODES: Record<number, string> = {
  0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
};

export function getIsStandupDay(schedule: { standup_days: string[]; standup_timezone: string } | null | undefined): boolean {
  if (!schedule?.standup_days) return true; // default to true if unknown
  const nowInTz = new Date(
    new Date().toLocaleString("en-US", { timeZone: schedule.standup_timezone || "UTC" })
  );
  const todayCode = DAY_CODES[nowInTz.getDay()];
  return schedule.standup_days.includes(todayCode);
}
