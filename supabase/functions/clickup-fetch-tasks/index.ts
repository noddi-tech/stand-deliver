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

    const { org_id, user_id } = await req.json();

    if (!org_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "org_id and user_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get installation
    const { data: installation } = await supabaseAdmin
      .from("clickup_installations")
      .select("api_token_encrypted, clickup_team_id")
      .eq("org_id", org_id)
      .single();

    if (!installation) {
      return new Response(
        JSON.stringify({ error: "ClickUp not connected" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get user mapping
    const { data: mapping } = await supabaseAdmin
      .from("clickup_user_mappings")
      .select("clickup_member_id")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .single();

    if (!mapping) {
      return new Response(
        JSON.stringify({
          error: "Your ClickUp account is not linked. Go to Settings > Integrations to link it.",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch tasks from ClickUp
    const params = new URLSearchParams();
    params.append("assignees[]", mapping.clickup_member_id);
    params.append("statuses[]", "in progress");
    params.append("statuses[]", "to do");
    params.append("statuses[]", "open");
    params.append("subtasks", "true");
    params.append("include_closed", "false");
    params.append("order_by", "updated");

    const url = `https://api.clickup.com/api/v2/team/${installation.clickup_team_id}/task?${params.toString()}`;

    const res = await fetch(url, {
      headers: { Authorization: installation.api_token_encrypted },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("ClickUp API error:", res.status, text);
      return new Response(
        JSON.stringify({ error: `ClickUp API error: ${res.status}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await res.json();
    const tasks = (data.tasks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || "unknown",
      status_color: t.status?.color || null,
      list_name: t.list?.name || null,
      url: t.url,
      priority: t.priority?.priority || null,
    }));

    return new Response(JSON.stringify({ tasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("clickup-fetch-tasks error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
