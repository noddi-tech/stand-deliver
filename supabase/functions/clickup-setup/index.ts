import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { org_id, api_token, action, clickup_team_id } = await req.json();

    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: disconnect
    if (action === "disconnect") {
      await supabaseAdmin
        .from("clickup_installations")
        .delete()
        .eq("org_id", org_id);
      await supabaseAdmin
        .from("clickup_user_mappings")
        .delete()
        .eq("org_id", org_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list-members — fetch workspace members from stored token
    if (action === "list-members") {
      const { data: installation } = await supabaseAdmin
        .from("clickup_installations")
        .select("api_token_encrypted, clickup_team_id")
        .eq("org_id", org_id)
        .single();

      if (!installation) {
        return new Response(
          JSON.stringify({ error: "No ClickUp installation found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const teamRes = await fetch(
        `https://api.clickup.com/api/v2/team/${installation.clickup_team_id}`,
        {
          headers: { Authorization: installation.api_token_encrypted },
        }
      );
      if (!teamRes.ok) {
        return new Response(
          JSON.stringify({
            error: `ClickUp API error: ${teamRes.status}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const teamData = await teamRes.json();
      const members = (teamData.team?.members || []).map((m: any) => ({
        id: String(m.user.id),
        username: m.user.username,
        email: m.user.email,
        name: m.user.username || m.user.email,
        avatar: m.user.profilePicture || null,
      }));

      return new Response(JSON.stringify({ members }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: save-mapping — save a user's ClickUp member mapping
    if (action === "save-mapping") {
      const { user_id, clickup_member_id, clickup_display_name } =
        await req.json().catch(() => ({}));
      // Already parsed above, re-read from original body
    }

    // Default action: validate token and connect
    if (!api_token) {
      return new Response(JSON.stringify({ error: "api_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate token by fetching workspaces
    const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: api_token },
    });

    if (!teamsRes.ok) {
      return new Response(
        JSON.stringify({
          error:
            teamsRes.status === 401
              ? "Invalid API token. Please check and try again."
              : `ClickUp API error: ${teamsRes.status}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const teamsData = await teamsRes.json();
    const teams = (teamsData.teams || []).map((t: any) => ({
      id: String(t.id),
      name: t.name,
    }));

    if (teams.length === 0) {
      return new Response(
        JSON.stringify({ error: "No ClickUp workspaces found for this token" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If clickup_team_id provided, save installation
    const selectedTeamId = clickup_team_id || teams[0].id;
    const selectedTeam = teams.find((t: any) => t.id === selectedTeamId) || teams[0];

    // Upsert installation
    const { error: upsertError } = await supabaseAdmin
      .from("clickup_installations")
      .upsert(
        {
          org_id,
          api_token_encrypted: api_token,
          clickup_team_id: selectedTeam.id,
          clickup_team_name: selectedTeam.name,
        },
        { onConflict: "org_id" }
      );

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch members for the selected workspace
    const teamDetailRes = await fetch(
      `https://api.clickup.com/api/v2/team/${selectedTeam.id}`,
      { headers: { Authorization: api_token } }
    );
    const teamDetail = await teamDetailRes.json();
    const members = (teamDetail.team?.members || []).map((m: any) => ({
      id: String(m.user.id),
      username: m.user.username,
      email: m.user.email,
      name: m.user.username || m.user.email,
      avatar: m.user.profilePicture || null,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        teams,
        selected_team: selectedTeam,
        members,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("clickup-setup error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
