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
    const { team_id } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get team and org
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("id, org_id, name")
      .eq("id", team_id)
      .single();
    if (!team) throw new Error("Team not found");

    // Get bot token
    const { data: installation } = await supabaseAdmin
      .from("slack_installations")
      .select("bot_token")
      .eq("org_id", team.org_id)
      .limit(1)
      .single();
    if (!installation) throw new Error("No Slack installation found");

    // Get team members with slack IDs
    const { data: members } = await supabaseAdmin
      .from("team_members")
      .select("id, user_id, slack_user_id, profiles(full_name)")
      .eq("team_id", team_id)
      .eq("is_active", true)
      .not("slack_user_id", "is", null);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ message: "No mapped members" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    for (const member of members) {
      // Get open commitments
      const { data: commitments } = await supabaseAdmin
        .from("commitments")
        .select("id, title, status, carry_count, priority")
        .eq("member_id", member.id)
        .in("status", ["active", "in_progress", "blocked", "carried"]);

      const commitmentBlocks = (commitments || []).map((c: any) => {
        const carryBadge = c.carry_count >= 2 ? ` ⚠️ carried ${c.carry_count}x` : "";
        return `• ${c.title}${carryBadge}`;
      });

      const blocks: any[] = [
        {
          type: "section",
          text: { type: "mrkdwn", text: "🌅 Good morning! Time for your standup." },
        },
      ];

      if (commitmentBlocks.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📋 *Your open commitments:*\n${commitmentBlocks.join("\n")}`,
          },
        });
      }

      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "▶️ Start Standup" },
            style: "primary",
            action_id: "start_standup",
            value: JSON.stringify({ team_id, member_id: member.id }),
          },
          {
            type: "button",
            text: { type: "plain_text", text: "⏰ Snooze 30m" },
            action_id: "snooze_standup",
            value: JSON.stringify({ team_id, member_id: member.id }),
          },
          {
            type: "button",
            text: { type: "plain_text", text: "⏭️ Skip Today" },
            action_id: "skip_standup",
            value: JSON.stringify({ team_id, member_id: member.id }),
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
          channel: member.slack_user_id,
          text: "Time for your standup!",
          blocks,
        }),
      });

      const result = await res.json();
      if (result.ok) sent++;
      else console.error(`Failed to send to ${member.slack_user_id}:`, result.error);
    }

    return new Response(JSON.stringify({ sent, total: members.length }), {
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
