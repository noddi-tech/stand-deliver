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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // org_id
    const error = url.searchParams.get("error");

    if (error) {
      return Response.redirect(`${Deno.env.get("SITE_URL") || "http://localhost:5173"}/settings?tab=integrations&slack=error`);
    }

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400, headers: corsHeaders });
    }

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert slack installation
    const { error: dbError } = await supabaseAdmin
      .from("slack_installations")
      .upsert(
        {
          org_id: state,
          workspace_id: tokenData.team.id,
          workspace_name: tokenData.team.name,
          bot_token: tokenData.access_token,
          bot_user_id: tokenData.bot_user_id,
          installed_at: new Date().toISOString(),
        },
        { onConflict: "org_id,workspace_id" }
      );

    if (dbError) {
      console.error("DB error:", dbError);
      throw new Error("Failed to store installation");
    }

    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";
    return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=connected`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";
    return Response.redirect(`${siteUrl}/settings?tab=integrations&slack=error`);
  }
});
