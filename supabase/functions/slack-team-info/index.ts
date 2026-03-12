const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider_token, team_id } = await req.json();

    if (!provider_token || !team_id) {
      return new Response(
        JSON.stringify({ error: "Missing provider_token or team_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resp = await fetch(`https://slack.com/api/team.info?team=${team_id}`, {
      headers: { Authorization: `Bearer ${provider_token}` },
    });

    const data = await resp.json();

    if (!data.ok) {
      console.error("Slack team.info error:", data.error);
      return new Response(
        JSON.stringify({ error: data.error, team_name: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ team_name: data.team.name }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("slack-team-info error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
