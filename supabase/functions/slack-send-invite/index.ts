import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSiteUrl } from "../_shared/routes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, team_id, slack_user_id, invited_by, app_url } = await req.json();
    if (!org_id || !slack_user_id) {
      return new Response(
        JSON.stringify({ error: "org_id and slack_user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get bot token for this org
    const { data: installation, error: installErr } = await supabase
      .from("slack_installations")
      .select("bot_token, workspace_name")
      .eq("org_id", org_id)
      .limit(1)
      .single();

    if (installErr || !installation) {
      return new Response(
        JSON.stringify({ error: "No Slack installation found for this org" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const siteUrl = app_url || Deno.env.get("SITE_URL") || "https://standup-flow-app.lovable.app";

    // Look up user info for display name
    const userInfoRes = await fetch(`https://slack.com/api/users.info?user=${slack_user_id}`, {
      headers: { Authorization: `Bearer ${installation.bot_token}` },
    });
    const userInfo = await userInfoRes.json();
    const displayName = userInfo.ok ? (userInfo.user?.real_name || userInfo.user?.name || null) : null;

    // Open a DM channel with the user
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users: slack_user_id }),
    });
    const openData = await openRes.json();
    if (!openData.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to open DM: ${openData.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const channelId = openData.channel.id;

    // Send the invite message
    const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        text: `You've been invited to join your team on StandFlow! Sign in to get started: ${siteUrl}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `👋 *You've been invited to StandFlow!*\n\nYour team at *${installation.workspace_name}* is using StandFlow for async standups. Click below to sign in with Slack and join.`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Sign in to StandFlow", emoji: true },
                url: siteUrl,
                style: "primary",
              },
            ],
          },
        ],
      }),
    });
    const msgData = await msgRes.json();

    if (!msgData.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to send message: ${msgData.error}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record the invite in slack_invites table
    if (team_id && invited_by) {
      await supabase.from("slack_invites").upsert(
        {
          org_id,
          team_id,
          slack_user_id,
          slack_display_name: displayName,
          invited_by,
          status: "pending",
        },
        { onConflict: "org_id,slack_user_id" }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("slack-send-invite error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
