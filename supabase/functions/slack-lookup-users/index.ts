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
    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: installation, error: installError } = await supabase
      .from("slack_installations")
      .select("bot_token")
      .eq("org_id", org_id)
      .limit(1)
      .maybeSingle();

    if (installError || !installation) {
      return new Response(JSON.stringify({ error: "No Slack installation found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all workspace users with pagination
    const allMembers: any[] = [];
    let cursor: string | undefined;

    do {
      const params = new URLSearchParams({ limit: "200" });
      if (cursor) params.set("cursor", cursor);

      const resp = await fetch(`https://slack.com/api/users.list?${params}`, {
        headers: { Authorization: `Bearer ${installation.bot_token}` },
      });
      const data = await resp.json();

      if (!data.ok) {
        return new Response(JSON.stringify({ error: data.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      for (const member of data.members || []) {
        if (member.deleted || member.is_bot || member.id === "USLACKBOT") continue;
        allMembers.push({
          id: member.id,
          name: member.name,
          real_name: member.real_name || member.name,
          email: member.profile?.email || null,
          avatar: member.profile?.image_48 || null,
        });
      }

      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return new Response(JSON.stringify({ users: allMembers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("slack-lookup-users error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
