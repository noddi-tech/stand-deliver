import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { upsertBadge } from "../_shared/activity-badges.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().split("T")[0];
    // ClickUp expects milliseconds since epoch for date_updated_gt
    const todayStart = new Date(`${today}T00:00:00.000Z`).getTime();

    // Get all orgs with ClickUp installed
    const { data: installations } = await supabaseAdmin
      .from("clickup_installations")
      .select("org_id, api_token_encrypted, clickup_team_id");

    if (!installations || installations.length === 0) {
      return new Response(JSON.stringify({ message: "No ClickUp installations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const install of installations) {
      // Get all user mappings for this org
      const { data: mappings } = await supabaseAdmin
        .from("clickup_user_mappings")
        .select("user_id, clickup_member_id, clickup_display_name")
        .eq("org_id", install.org_id);

      if (!mappings || mappings.length === 0) continue;

      // Get team_members for these users to find team_id and member_id
      const userIds = mappings.map((m) => m.user_id);
      const { data: teamMembers } = await supabaseAdmin
        .from("team_members")
        .select("id, user_id, team_id")
        .in("user_id", userIds)
        .eq("is_active", true);

      if (!teamMembers || teamMembers.length === 0) continue;

      const token = install.api_token_encrypted;

      for (const mapping of mappings) {
        const memberRecords = teamMembers.filter((tm) => tm.user_id === mapping.user_id);
        if (memberRecords.length === 0) continue;

        // Fetch tasks updated today assigned to this user
        try {
          const tasksRes = await fetch(
            `https://api.clickup.com/api/v2/team/${install.clickup_team_id}/task?assignees[]=${mapping.clickup_member_id}&date_updated_gt=${todayStart}&include_closed=true&subtasks=true`,
            {
              headers: { Authorization: token },
            }
          );

          if (!tasksRes.ok) {
            console.error(`ClickUp API error: ${tasksRes.status}`);
            continue;
          }

          const tasksData = await tasksRes.json();
          const tasks = tasksData.tasks || [];

          for (const task of tasks) {
            const statusName = task.status?.status?.toLowerCase() || "";
            const isCompleted = ["complete", "done", "closed", "resolved"].some((s) =>
              statusName.includes(s)
            );
            const isInProgress = ["in progress", "in review", "working"].some((s) =>
              statusName.includes(s)
            );

            let activityType = "task_updated";
            if (isCompleted) activityType = "task_completed";
            else if (isInProgress) activityType = "task_started";

            const taskUrl = task.url || `https://app.clickup.com/t/${task.id}`;

            // Insert for each team the user belongs to
            for (const member of memberRecords) {
              try {
                await supabaseAdmin.from("external_activity").upsert(
                  {
                    team_id: member.team_id,
                    member_id: member.id,
                    source: "clickup",
                    activity_type: activityType,
                    title: task.name,
                    external_id: task.id,
                    external_url: taskUrl,
                    metadata: {
                      status: task.status?.status,
                      list: task.list?.name,
                      priority: task.priority?.priority,
                    },
                    occurred_at: task.date_updated
                      ? new Date(parseInt(task.date_updated)).toISOString()
                      : new Date().toISOString(),
                  },
                  { onConflict: "team_id,member_id,external_id,activity_type,source" }
                );
                // Badge resolution for ClickUp tasks
                const insertedId = (await supabaseAdmin.from("external_activity").select("id").eq("team_id", member.team_id).eq("member_id", member.id).eq("external_id", task.id).eq("source", "clickup").maybeSingle()).data?.id;
                if (insertedId) {
                  await upsertBadge(supabaseAdmin, {
                    id: insertedId,
                    source: "clickup", activity_type: activityType, title: task.name,
                    source_type: "external_activity",
                    metadata: { list_name: task.list?.name, tags: task.tags?.map((t: any) => t.name) || [] },
                  }, member.team_id);
                }
              } catch (e) {
                console.error("Insert error:", e);
              }

              // Auto-resolve linked commitments when ClickUp task is completed
              if (activityType === "task_completed") {
                try {
                  const { data: linkedCommitments } = await supabaseAdmin
                    .from("commitments")
                    .select("id")
                    .eq("clickup_task_id", task.id)
                    .eq("member_id", member.id)
                    .in("status", ["active", "in_progress", "carried"]);

                  if (linkedCommitments && linkedCommitments.length > 0) {
                    for (const commitment of linkedCommitments) {
                      await supabaseAdmin
                        .from("commitments")
                        .update({
                          status: "done",
                          resolved_at: new Date().toISOString(),
                          resolution_note: "Auto-resolved: ClickUp task completed",
                          updated_at: new Date().toISOString(),
                        })
                        .eq("id", commitment.id);
                      console.log(`Auto-resolved commitment ${commitment.id} (ClickUp task ${task.id})`);
                    }
                  }
                } catch (e) {
                  console.error("Auto-resolve error:", e);
                }
              }
            }
          }

          results.push({
            org_id: install.org_id,
            user: mapping.clickup_display_name,
            tasks_checked: tasks.length,
          });
        } catch (e) {
          console.error("ClickUp fetch error:", e);
        }
      }
    }

    // Trigger badge detection for all teams that had activity
    const teamsWithActivity = new Set<string>();
    for (const r of results) {
      // Find team IDs from the processed mappings
    }
    // Collect unique team IDs from team members we processed
    for (const install of installations) {
      const { data: mappings } = await supabaseAdmin
        .from("clickup_user_mappings")
        .select("user_id")
        .eq("org_id", install.org_id);
      if (!mappings) continue;
      const userIds = mappings.map((m) => m.user_id);
      const { data: tms } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .in("user_id", userIds)
        .eq("is_active", true);
      for (const tm of tms || []) teamsWithActivity.add(tm.team_id);
    }
    for (const tid of teamsWithActivity) {
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-badges`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ team_id: tid }),
          }
        );
      } catch (e) {
        console.error(`Badge detection failed for team ${tid}:`, e);
      }
    }

    // ─── VIS CLASSIFY: Batch classification for all ClickUp activity ───
    for (const tid of teamsWithActivity) {
      try {
        const { data: recentActivity } = await supabaseAdmin
          .from("external_activity")
          .select("id, activity_type, title, member_id, metadata, source")
          .eq("team_id", tid)
          .eq("source", "clickup")
          .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

        if (!recentActivity || recentActivity.length === 0) continue;

        const toClassify = recentActivity.map((a) => ({
          id: a.id,
          source_type: "external_activity" as const,
          source: a.source,
          activity_type: a.activity_type,
          title: a.title,
          metadata: a.metadata as Record<string, any> | undefined,
          member_id: a.member_id,
        }));

        for (let b = 0; b < toClassify.length; b += 20) {
          const batch = toClassify.slice(b, b + 20);
          try {
            await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-classify-contributions`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ team_id: tid, items: batch }),
              }
            );
            console.log(`VIS: classified ${batch.length} ClickUp items for team ${tid}`);
          } catch (batchErr) {
            console.error(`VIS batch classification error for team ${tid}:`, batchErr);
          }
        }
      } catch (visErr) {
        console.error(`VIS ClickUp classification error for team ${tid}:`, visErr);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
