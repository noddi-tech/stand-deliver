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
    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "Missing org_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the requesting user is an org member
    const authHeader = req.headers.get("authorization");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract user from JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is member of the org
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member of this organization" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a cryptographic nonce
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("");

    // Store the nonce with org_id and user_id
    const { error: insertError } = await supabaseAdmin
      .from("slack_oauth_states")
      .insert({
        nonce,
        org_id,
        user_id: user.id,
      });

    if (insertError) {
      console.error("Failed to store OAuth state:", insertError);
      throw new Error("Failed to initiate OAuth flow");
    }

    // Clean up expired nonces (older than 10 minutes)
    await supabaseAdmin
      .from("slack_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    // Build the Slack OAuth URL
    const clientId = Deno.env.get("SLACK_CLIENT_ID");
    if (!clientId) {
      throw new Error("SLACK_CLIENT_ID not configured");
    }

    const scopes = "app_mentions:read,chat:write,chat:write.public,commands,im:write,im:read,im:history,users:read,users:read.email,channels:read,groups:read";
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/slack-oauth-callback`;
    const oauthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

    return new Response(JSON.stringify({ url: oauthUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("OAuth start error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
