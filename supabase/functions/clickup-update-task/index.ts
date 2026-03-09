import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map StandFlow status to possible ClickUp status names (lowercase for matching)
const statusMappings: Record<string, string[]> = {
  done: ["complete", "closed", "done", "resolved", "finished"],
  in_progress: ["in progress", "in review", "doing", "working"],
  blocked: ["in progress", "blocked", "on hold"],
  active: ["to do", "open", "todo", "not started", "backlog"],
  carried: ["to do", "open", "todo", "not started"],
  dropped: ["closed", "cancelled", "canceled", "archived"],
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

    const { org_id, clickup_task_id, new_status } = await req.json();

    if (!org_id || !clickup_task_id || !new_status) {
      return new Response(
        JSON.stringify({ error: "org_id, clickup_task_id, and new_status required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get installation token
    const { data: installation } = await supabaseAdmin
      .from("clickup_installations")
      .select("api_token_encrypted")
      .eq("org_id", org_id)
      .single();

    if (!installation) {
      return new Response(
        JSON.stringify({ error: "ClickUp not connected" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiToken = installation.api_token_encrypted;

    // Fetch the task to get its list ID
    const taskRes = await fetch(
      `https://api.clickup.com/api/v2/task/${clickup_task_id}`,
      { headers: { Authorization: apiToken } }
    );

    if (!taskRes.ok) {
      console.error("Failed to fetch ClickUp task:", taskRes.status);
      return new Response(
        JSON.stringify({ error: `Failed to fetch task: ${taskRes.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskData = await taskRes.json();
    const listId = taskData.list?.id;

    if (!listId) {
      return new Response(
        JSON.stringify({ error: "Could not determine task list" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch valid statuses for this list
    const listRes = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}`,
      { headers: { Authorization: apiToken } }
    );

    if (!listRes.ok) {
      console.error("Failed to fetch list:", listRes.status);
      return new Response(
        JSON.stringify({ error: `Failed to fetch list: ${listRes.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listData = await listRes.json();
    const validStatuses: string[] = (listData.statuses || []).map(
      (s: any) => s.status as string
    );

    console.log("Valid statuses for list:", validStatuses);
    console.log("Mapping from StandFlow status:", new_status);

    // Find the best matching ClickUp status
    const candidates = statusMappings[new_status] || [];
    let targetStatus: string | null = null;

    for (const candidate of candidates) {
      const match = validStatuses.find(
        (vs) => vs.toLowerCase() === candidate.toLowerCase()
      );
      if (match) {
        targetStatus = match;
        break;
      }
    }

    if (!targetStatus) {
      // Fallback: partial match
      for (const candidate of candidates) {
        const match = validStatuses.find((vs) =>
          vs.toLowerCase().includes(candidate.toLowerCase()) ||
          candidate.toLowerCase().includes(vs.toLowerCase())
        );
        if (match) {
          targetStatus = match;
          break;
        }
      }
    }

    if (!targetStatus) {
      console.warn(
        `No matching ClickUp status for "${new_status}". Valid: ${validStatuses.join(", ")}`
      );
      return new Response(
        JSON.stringify({
          warning: `No matching ClickUp status found for "${new_status}"`,
          valid_statuses: validStatuses,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the task status in ClickUp
    const updateRes = await fetch(
      `https://api.clickup.com/api/v2/task/${clickup_task_id}`,
      {
        method: "PUT",
        headers: {
          Authorization: apiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: targetStatus }),
      }
    );

    if (!updateRes.ok) {
      const text = await updateRes.text();
      console.error("ClickUp update error:", updateRes.status, text);
      return new Response(
        JSON.stringify({ error: `ClickUp update failed: ${updateRes.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updated ClickUp task ${clickup_task_id} to "${targetStatus}"`);

    return new Response(
      JSON.stringify({ success: true, clickup_status: targetStatus }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("clickup-update-task error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
