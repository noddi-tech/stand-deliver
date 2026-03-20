import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSiteUrl } from "../_shared/routes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const siteUrl = Deno.env.get("SITE_URL") || "https://standup-flow-app.lovable.app";

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // nonce
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=error`);
    }

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate the nonce and extract org_id
    const { data: oauthState, error: stateError } = await supabaseAdmin
      .from("slack_oauth_states")
      .select("id, org_id, user_id, created_at")
      .eq("nonce", state)
      .maybeSingle();

    if (stateError || !oauthState) {
      console.error("Invalid OAuth state nonce:", state);
      return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=error`);
    }

    // Check nonce freshness (10 minutes)
    const nonceAge = Date.now() - new Date(oauthState.created_at).getTime();
    if (nonceAge > 10 * 60 * 1000) {
      console.error("OAuth state nonce expired");
      // Clean up expired nonce
      await supabaseAdmin.from("slack_oauth_states").delete().eq("id", oauthState.id);
      return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=error`);
    }

    // Delete the nonce (single-use)
    await supabaseAdmin.from("slack_oauth_states").delete().eq("id", oauthState.id);

    const orgId = oauthState.org_id;

    const clientId = Deno.env.get("SLACK_CLIENT_ID");
    const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      throw new Error("Slack credentials not configured");
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${Deno.env.get("SUPABASE_URL")}/functions/v1/slack-oauth-callback`,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.ok) {
      console.error("Slack OAuth error:", tokenData);
      throw new Error(`Slack OAuth failed: ${tokenData.error}`);
    }

    // Upsert slack installation
    const { error: dbError } = await supabaseAdmin
      .from("slack_installations")
      .upsert(
        {
          org_id: orgId,
          workspace_id: tokenData.team.id,
          workspace_name: tokenData.team.name,
          bot_token: tokenData.access_token,
          bot_user_id: tokenData.bot_user_id,
          installed_at: new Date().toISOString(),
          installing_user_id: oauthState.user_id,
        },
        { onConflict: "org_id,workspace_id" }
      );

    if (dbError) {
      console.error("DB error:", dbError);
      throw new Error("Failed to store installation");
    }

    return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=connected`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=error`);
  }
});
