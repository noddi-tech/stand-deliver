import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ...
    const isMonday = dayOfWeek === 1;

    // On Mondays, expand range to include Saturday + Sunday
    const rangeStart = isMonday
      ? new Date(new Date(`${today}T00:00:00.000Z`).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      : today;
    const rangeStartTs = `${rangeStart}T00:00:00.000Z`;
    const rangeEndTs = `${today}T23:59:59.999Z`;

    // Get all teams with Slack configured
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, org_id, slack_channel_id");

    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify({ message: "No teams found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const team of teams) {
      // Skip if no Slack channel configured
      if (!team.slack_channel_id) continue;

      // Get today's session
      const { data: session } = await supabaseAdmin
        .from("standup_sessions")
        .select("id, session_date, status, ai_summary")
        .eq("team_id", team.id)
        .eq("session_date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get commitment changes for the range
      const { data: history } = await supabaseAdmin
        .from("commitment_history")
        .select("old_status, new_status, commitment_id")
        .gte("changed_at", rangeStartTs)
        .lte("changed_at", rangeEndTs);

      // Filter history to only this team's commitments
      const commitmentIds = [...new Set((history || []).map((h) => h.commitment_id))];
      let teamCommitmentIds = new Set<string>();
      if (commitmentIds.length > 0) {
        const { data: commitments } = await supabaseAdmin
          .from("commitments")
          .select("id")
          .eq("team_id", team.id)
          .in("id", commitmentIds);
        teamCommitmentIds = new Set((commitments || []).map((c) => c.id));
      }

      let completed = 0;
      let carried = 0;
      let blocked = 0;

      for (const h of history || []) {
        if (!teamCommitmentIds.has(h.commitment_id)) continue;
        if (h.new_status === "done") completed++;
        if (h.new_status === "carried") carried++;
        if (h.new_status === "blocked") blocked++;
      }

      // Count new commitments
      const { count: newCommitments } = await supabaseAdmin
        .from("commitments")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .gte("created_at", rangeStartTs)
        .lte("created_at", rangeEndTs);

      // Get response count
      let responseCount = 0;
      if (session) {
        const { data: responses } = await supabaseAdmin
          .from("standup_responses")
          .select("id")
          .eq("session_id", session.id);
        responseCount = responses?.length || 0;
      }

      const { count: totalMembers } = await supabaseAdmin
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .eq("is_active", true);

      // Get blockers
      const { count: newBlockers } = await supabaseAdmin
        .from("blockers")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .gte("created_at", rangeStartTs)
        .lte("created_at", rangeEndTs);

      const { count: resolvedBlockers } = await supabaseAdmin
        .from("blockers")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .eq("is_resolved", true)
        .gte("resolved_at", rangeStartTs)
        .lte("resolved_at", rangeEndTs);

      // Get external activity counts for the range
      const { data: extActivity } = await supabaseAdmin
        .from("external_activity")
        .select("source, activity_type, metadata")
        .eq("team_id", team.id)
        .gte("occurred_at", rangeStartTs)
        .lte("occurred_at", rangeEndTs);

      // Aggregate external activity
      let ghCommits = 0, ghPrsOpened = 0, ghPrsMerged = 0;
      let cuCompleted = 0, cuStarted = 0;
      const ghRepos = new Set<string>();

      for (const ea of extActivity || []) {
        if (ea.source === "github") {
          if (ea.activity_type === "commit") {
            ghCommits++;
            const repo = (ea.metadata as any)?.repo;
            if (repo) ghRepos.add(repo);
          }
          if (ea.activity_type === "pr_opened") ghPrsOpened++;
          if (ea.activity_type === "pr_merged") ghPrsMerged++;
        }
        if (ea.source === "clickup") {
          if (ea.activity_type === "task_completed") cuCompleted++;
          if (ea.activity_type === "task_started") cuStarted++;
        }
      }

      // Generate AI summary if not already done
      let aiSummary = session?.ai_summary;
      if (session && !aiSummary && responseCount > 0) {
        try {
          const summaryRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-summarize-session`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ session_id: session.id }),
            }
          );
          const summaryData = await summaryRes.json();
          aiSummary = summaryData.summary;
        } catch (e) {
          console.error("AI summary failed:", e);
        }
      }

      // Build Slack message
      const memberCount = totalMembers || 0;
      const dateLabel = isMonday ? `${rangeStart} — ${today}` : today;

      const lines: string[] = [];
      if (completed > 0) lines.push(`✅ ${completed} task${completed !== 1 ? "s" : ""} completed`);
      if (newCommitments && newCommitments > 0) lines.push(`🆕 ${newCommitments} new commitment${newCommitments !== 1 ? "s" : ""} added`);
      if (carried > 0) lines.push(`🔄 ${carried} task${carried !== 1 ? "s" : ""} carried forward`);

      const blockerParts: string[] = [];
      if ((newBlockers || 0) > 0) blockerParts.push(`${newBlockers} new blocker${newBlockers !== 1 ? "s" : ""}`);
      if ((resolvedBlockers || 0) > 0) blockerParts.push(`${resolvedBlockers} blocker${resolvedBlockers !== 1 ? "s" : ""} resolved`);
      if (blockerParts.length > 0) lines.push(`🚫 ${blockerParts.join(" · ")}`);

      if (session) {
        lines.push(`👥 ${responseCount} of ${memberCount} members submitted standups`);
      }

      // External activity lines
      if (ghCommits > 0) {
        lines.push(`🔗 ${ghCommits} commit${ghCommits !== 1 ? "s" : ""}${ghRepos.size > 0 ? ` across ${ghRepos.size} repo${ghRepos.size !== 1 ? "s" : ""}` : ""}`);
      }
      if (ghPrsMerged > 0 || ghPrsOpened > 0) {
        const prParts: string[] = [];
        if (ghPrsMerged > 0) prParts.push(`${ghPrsMerged} merged`);
        if (ghPrsOpened > 0) prParts.push(`${ghPrsOpened} opened`);
        lines.push(`🔀 ${prParts.join(", ")} PR${(ghPrsMerged + ghPrsOpened) !== 1 ? "s" : ""}`);
      }
      if (cuCompleted > 0 || cuStarted > 0) {
        const cuParts: string[] = [];
        if (cuCompleted > 0) cuParts.push(`${cuCompleted} completed`);
        if (cuStarted > 0) cuParts.push(`${cuStarted} started`);
        lines.push(`📋 ${cuParts.join(", ")} ClickUp task${(cuCompleted + cuStarted) !== 1 ? "s" : ""}`);
      }

      if (aiSummary) {
        lines.push(`\n✨ *AI Summary:* ${aiSummary}`);
      }

      if (isMonday) {
        lines.unshift("_Includes Saturday & Sunday activity_");
      }

      // Post to Slack
      const { data: installation } = await supabaseAdmin
        .from("slack_installations")
        .select("bot_token")
        .eq("org_id", team.org_id)
        .limit(1)
        .single();

      if (installation?.bot_token) {
        const blocks: any[] = [
          {
            type: "header",
            text: { type: "plain_text", text: `📊 Daily Digest — ${dateLabel}` },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text: lines.join("\n") },
          },
        ];

        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${installation.bot_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: team.slack_channel_id,
            text: `Daily Digest — ${dateLabel}`,
            blocks,
          }),
        });

        results.push({ team: team.name, posted: true });
      }

      // Mark session as completed if still collecting
      if (session && session.status !== "completed") {
        await supabaseAdmin
          .from("standup_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", session.id);
      }
    }

    // Trigger badge detection for all teams as a daily safety net
    for (const team of teams) {
      try {
        await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/detect-badges`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ team_id: team.id }),
          }
        );
      } catch (e) {
        console.error(`Badge detection failed for team ${team.id}:`, e);
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
