import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSiteUrl, ROUTES } from "../_shared/routes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Get all teams
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, org_id, name, slack_channel_id, standup_days, standup_timezone, standup_time, standup_day_modes, standup_day_times");

    if (teamsError) throw teamsError;
    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify({ message: "No teams found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
    let totalFollowups = 0;

    for (const team of teams) {
      // Check if Slack is installed
      const { data: installation } = await supabaseAdmin
        .from("slack_installations")
        .select("bot_token")
        .eq("org_id", team.org_id)
        .limit(1)
        .maybeSingle();

      if (!installation) continue;

      // Check if today is a standup day in team's timezone
      const teamNow = new Date(now.toLocaleString("en-US", { timeZone: team.standup_timezone || "UTC" }));
      const teamDay = dayMap[teamNow.getDay()];
      if (!team.standup_days.includes(teamDay)) continue;

      // Check today's mode — skip physical days
      const dayModes = (team as any).standup_day_modes || {};
      const todayMode = dayModes[teamDay] || "async";
      if (todayMode === "physical") continue;

      // Only run follow-ups AFTER standup time
      const dayTimesMap = (team as any).standup_day_times || {};
      const effectiveTime = dayTimesMap[teamDay] || team.standup_time || "09:00:00";
      const [hours, minutes] = effectiveTime.split(":").map(Number);
      const standupMinutes = hours * 60 + minutes;
      const currentMinutes = teamNow.getHours() * 60 + teamNow.getMinutes();

      // Must be at least 1 hour after standup time, and within work hours (before 6pm)
      if (currentMinutes < standupMinutes + 60 || currentMinutes > 18 * 60) continue;

      const today = teamNow.toISOString().split("T")[0];

      // Find today's session
      const { data: session } = await supabaseAdmin
        .from("standup_sessions")
        .select("id")
        .eq("team_id", team.id)
        .eq("session_date", today)
        .maybeSingle();

      if (!session) continue;

      // Get active members with Slack IDs
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("id, user_id, slack_user_id, profiles(full_name)")
        .eq("team_id", team.id)
        .eq("is_active", true)
        .not("slack_user_id", "is", null);

      if (!members || members.length === 0) continue;

      // Get members who HAVE submitted
      const { data: responses } = await supabaseAdmin
        .from("standup_responses")
        .select("member_id")
        .eq("session_id", session.id);

      const submittedMemberIds = new Set((responses || []).map((r: any) => r.member_id));

      // Filter to members who haven't submitted
      const missingMembers = members.filter((m: any) => !submittedMemberIds.has(m.id));
      if (missingMembers.length === 0) continue;

      // Process each missing member
      const membersForPublicPost: Array<{ slack_user_id: string; name: string }> = [];

      for (const member of missingMembers) {
        // Get or create reminder record
        const { data: existing } = await supabaseAdmin
          .from("standup_reminders")
          .select("id, reminder_count, last_sent_at")
          .eq("team_id", team.id)
          .eq("member_id", member.id)
          .eq("session_date", today)
          .maybeSingle();

        const currentCount = existing?.reminder_count || 0;

        // Don't send more than once per hour — check last_sent_at
        if (existing?.last_sent_at) {
          const lastSent = new Date(existing.last_sent_at);
          const minutesSinceLast = (now.getTime() - lastSent.getTime()) / 60000;
          if (minutesSinceLast < 55) continue; // Allow 5min buffer
        }

        const newCount = currentCount + 1;

        // Upsert reminder record
        await supabaseAdmin
          .from("standup_reminders")
          .upsert(
            {
              team_id: team.id,
              member_id: member.id,
              session_date: today,
              reminder_count: newCount,
              last_sent_at: now.toISOString(),
            },
            { onConflict: "team_id,member_id,session_date" }
          );

        if (newCount >= 3) {
          // Collect for public post
          const name = (member as any).profiles?.full_name || "Someone";
          membersForPublicPost.push({ slack_user_id: member.slack_user_id!, name });
        } else {
          // Send DM
          const messageText = newCount === 1
            ? "👋 Friendly nudge — your standup is still waiting for you today."
            : "⏰ Second reminder — please submit your standup so the team stays in sync.";

          const blocks: any[] = [
            {
              type: "section",
              text: { type: "mrkdwn", text: messageText },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: { type: "plain_text", text: "▶️ Start Standup" },
                  style: "primary",
                  url: `${getSiteUrl()}${ROUTES.standup}`,
                },
              ],
            },
          ];

          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${installation.bot_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: member.slack_user_id,
              text: messageText,
              blocks,
            }),
          });

          totalFollowups++;
        }
      }

      // Post public message for members with 3+ reminders
      if (membersForPublicPost.length > 0 && team.slack_channel_id) {
        const mentions = membersForPublicPost
          .map((m) => `<@${m.slack_user_id}>`)
          .join(", ");

        const publicMessage = `⚠️ ${mentions} still hasn't posted their standup today. Please check in!`;

        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${installation.bot_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: team.slack_channel_id,
            text: publicMessage,
          }),
        });

        totalFollowups += membersForPublicPost.length;
      }
    }

    return new Response(JSON.stringify({ followups_sent: totalFollowups }), {
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
