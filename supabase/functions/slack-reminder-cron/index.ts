import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all teams with Slack connected
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, org_id, name, standup_time, standup_timezone, standup_days, slack_channel_id");

    if (teamsError) throw teamsError;
    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify({ message: "No teams found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
    
    let triggered = 0;

    for (const team of teams) {
      // Check if this team has Slack installed
      const { data: installation } = await supabaseAdmin
        .from("slack_installations")
        .select("id")
        .eq("org_id", team.org_id)
        .limit(1)
        .maybeSingle();

      if (!installation) continue;

      // Convert current time to team's timezone
      const teamNow = new Date(now.toLocaleString("en-US", { timeZone: team.standup_timezone || "UTC" }));
      const teamDay = dayMap[teamNow.getDay()];
      
      // Check if today is a standup day
      if (!team.standup_days.includes(teamDay)) continue;

      // Parse standup_time (HH:MM:SS format)
      const [hours, minutes] = (team.standup_time || "09:00:00").split(":").map(Number);
      const teamHour = teamNow.getHours();
      const teamMinute = teamNow.getMinutes();

      // Check if within 15-minute window of standup time
      const standupMinutes = hours * 60 + minutes;
      const currentMinutes = teamHour * 60 + teamMinute;
      const diff = currentMinutes - standupMinutes;

      if (diff < 0 || diff >= 15) continue;

      // Create today's session if it doesn't exist
      const today = teamNow.toISOString().split("T")[0];
      const { data: existingSession } = await supabaseAdmin
        .from("standup_sessions")
        .select("id")
        .eq("team_id", team.id)
        .eq("session_date", today)
        .maybeSingle();

      if (!existingSession) {
        await supabaseAdmin
          .from("standup_sessions")
          .insert({ team_id: team.id, session_date: today, status: "collecting" });
      }

      // Call slack-send-reminder for this team
      const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/slack-send-reminder`;
      const res = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ team_id: team.id }),
      });

      const result = await res.json();
      console.log(`Reminder for team ${team.name}: sent=${result.sent || 0}`);
      triggered++;
    }

    return new Response(JSON.stringify({ triggered, total_teams: teams.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
