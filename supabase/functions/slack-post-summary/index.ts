import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get session with team
    const { data: session } = await supabaseAdmin
      .from("standup_sessions")
      .select("id, session_date, team_id, teams(org_id, slack_channel_id, name)")
      .eq("id", session_id)
      .single();
    if (!session) throw new Error("Session not found");

    const team = session.teams as any;
    if (!team?.slack_channel_id) throw new Error("No Slack channel configured");

    // Get bot token
    const { data: installation } = await supabaseAdmin
      .from("slack_installations")
      .select("bot_token")
      .eq("org_id", team.org_id)
      .limit(1)
      .single();
    if (!installation) throw new Error("No Slack installation");

    // Get responses with member info
    const { data: responses } = await supabaseAdmin
      .from("standup_responses")
      .select("*, team_members(user_id, profiles(full_name))")
      .eq("session_id", session_id);

    // Get total member count
    const { count: totalMembers } = await supabaseAdmin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", session.team_id)
      .eq("is_active", true);

    const moodEmoji: Record<string, string> = {
      great: "🚀",
      good: "👍",
      okay: "😐",
      struggling: "😓",
      rough: "😰",
    };

    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 Standup Summary — ${session.session_date}` },
      },
    ];

    let doneCount = 0;
    let blockerCount = 0;

    for (const resp of responses || []) {
      const member = resp.team_members as any;
      const name = member?.profiles?.full_name || "Unknown";
      const mood = resp.mood ? ` ${moodEmoji[resp.mood] || ""} ${resp.mood}` : "";

      let text = `*👤 ${name}*${mood}\n`;
      if (resp.yesterday_text) text += `✅ ${resp.yesterday_text}\n`;
      if (resp.today_text) text += `🎯 ${resp.today_text}\n`;
      if (resp.blockers_text) {
        text += `🚫 ${resp.blockers_text}\n`;
        blockerCount++;
      }
      if (resp.yesterday_text) doneCount++;

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: text.trim() },
      });
      blocks.push({ type: "divider" });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${responses?.length || 0} of ${totalMembers || 0} members responded · ${doneCount} items done · ${blockerCount} blocker${blockerCount !== 1 ? "s" : ""}`,
        },
      ],
    });

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: team.slack_channel_id,
        text: `Standup Summary — ${session.session_date}`,
        blocks,
      }),
    });

    const result = await res.json();
    if (!result.ok) throw new Error(`Slack error: ${result.error}`);

    return new Response(JSON.stringify({ success: true }), {
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
