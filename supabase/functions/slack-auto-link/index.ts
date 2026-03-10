import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, member_id, user_id, slack_user_id_override } = await req.json();
    if (!org_id || !member_id || !user_id) {
      return new Response(JSON.stringify({ error: "org_id, member_id, and user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user email from auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user_id);
    if (authError || !authUser?.user?.email) {
      return new Response(JSON.stringify({ error: "Could not find user email" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = authUser.user.email;

    // Get bot token
    const { data: installation } = await supabase
      .from("slack_installations")
      .select("bot_token")
      .eq("org_id", org_id)
      .limit(1)
      .maybeSingle();

    if (!installation) {
      return new Response(JSON.stringify({ error: "No Slack installation found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If admin provided a direct slack_user_id override, use it directly
    if (slack_user_id_override) {
      await supabase
        .from("team_members")
        .update({ slack_user_id: slack_user_id_override })
        .eq("id", member_id);

      await supabase
        .from("slack_user_mappings")
        .upsert(
          { org_id, user_id, slack_user_id: slack_user_id_override, slack_display_name: null },
          { onConflict: "user_id,org_id" }
        );

      return new Response(
        JSON.stringify({ slack_user_id: slack_user_id_override, display_name: slack_user_id_override }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup by email
    const resp = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${installation.bot_token}` } }
    );
    const data = await resp.json();

    if (!data.ok) {
      const msg = data.error === "users_not_found"
        ? `No Slack user found with email ${email}. Make sure your Slack account uses the same email.`
        : `Slack API error: ${data.error}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slackUserId = data.user.id;
    const slackDisplayName = data.user.real_name || data.user.name;

    // Update team_members
    await supabase
      .from("team_members")
      .update({ slack_user_id: slackUserId })
      .eq("id", member_id);

    // Upsert slack_user_mappings
    await supabase
      .from("slack_user_mappings")
      .upsert(
        {
          org_id,
          user_id,
          slack_user_id: slackUserId,
          slack_display_name: slackDisplayName,
        },
        { onConflict: "user_id,org_id" }
      );

    // Mark any matching pending invite as accepted
    await supabase
      .from("slack_invites")
      .update({ status: "accepted" })
      .eq("org_id", org_id)
      .eq("slack_user_id", slackUserId)
      .eq("status", "pending");

    return new Response(
      JSON.stringify({ slack_user_id: slackUserId, display_name: slackDisplayName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("slack-auto-link error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
