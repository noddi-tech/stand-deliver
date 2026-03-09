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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().split("T")[0];

    // Get all teams with Slack configured
    const { data: teams } = await supabaseAdmin
      .from("teams")
      .select("id, name, org_id, slack_channel_id, standup_days");

    if (!teams || teams.length === 0) {
      return new Response(JSON.stringify({ message: "No teams found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayMap: Record<string, string> = {
      "0": "sun", "1": "mon", "2": "tue", "3": "wed", "4": "thu", "5": "fri", "6": "sat",
    };
    const todayDay = dayMap[new Date().getDay().toString()];

    const results: any[] = [];

    for (const team of teams) {
      // Skip if today is not a standup day for this team
      if (!team.standup_days?.includes(todayDay)) continue;
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

      if (!session) continue;

      // Get commitment changes for today
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;

      const { data: history } = await supabaseAdmin
        .from("commitment_history")
        .select("old_status, new_status, commitment_id")
        .gte("changed_at", todayStart)
        .lte("changed_at", todayEnd);

      // Count activity
      let completed = 0;
      let newCommitments = 0;
      let carried = 0;
      let blocked = 0;
      let unblockedOrResolved = 0;

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

      for (const h of history || []) {
        if (!teamCommitmentIds.has(h.commitment_id)) continue;
        if (h.new_status === "done") completed++;
        if (h.new_status === "carried") carried++;
        if (h.new_status === "blocked") blocked++;
        if (h.old_status === "blocked" && h.new_status !== "blocked") unblockedOrResolved++;
      }

      // Count new commitments created today
      const { count: newCount } = await supabaseAdmin
        .from("commitments")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd);
      newCommitments = newCount || 0;

      // Get response count
      const { data: responses } = await supabaseAdmin
        .from("standup_responses")
        .select("id")
        .eq("session_id", session.id);

      const { count: totalMembers } = await supabaseAdmin
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .eq("is_active", true);

      // Get new blockers created today
      const { count: newBlockers } = await supabaseAdmin
        .from("blockers")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .gte("created_at", todayStart)
        .lte("created_at", todayEnd);

      const { count: resolvedBlockers } = await supabaseAdmin
        .from("blockers")
        .select("id", { count: "exact", head: true })
        .eq("team_id", team.id)
        .eq("is_resolved", true)
        .gte("resolved_at", todayStart)
        .lte("resolved_at", todayEnd);

      // Generate AI summary if not already done
      let aiSummary = session.ai_summary;
      if (!aiSummary && (responses?.length || 0) > 0) {
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
      const responseCount = responses?.length || 0;
      const memberCount = totalMembers || 0;

      const lines: string[] = [];
      if (completed > 0) lines.push(`✅ ${completed} task${completed !== 1 ? "s" : ""} completed`);
      if (newCommitments > 0) lines.push(`🆕 ${newCommitments} new commitment${newCommitments !== 1 ? "s" : ""} added`);
      if (carried > 0) lines.push(`🔄 ${carried} task${carried !== 1 ? "s" : ""} carried forward`);
      
      const blockerParts: string[] = [];
      if ((newBlockers || 0) > 0) blockerParts.push(`${newBlockers} new blocker${newBlockers !== 1 ? "s" : ""}`);
      if ((resolvedBlockers || 0) > 0) blockerParts.push(`${resolvedBlockers} blocker${resolvedBlockers !== 1 ? "s" : ""} resolved`);
      if (blockerParts.length > 0) lines.push(`🚫 ${blockerParts.join(" · ")}`);

      lines.push(`👥 ${responseCount} of ${memberCount} members submitted standups`);

      if (aiSummary) {
        lines.push(`\n✨ *AI Summary:* ${aiSummary}`);
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
            text: { type: "plain_text", text: `📊 Daily Digest — ${today}` },
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
            text: `Daily Digest — ${today}`,
            blocks,
          }),
        });

        results.push({ team: team.name, posted: true });
      }

      // Mark session as completed if still collecting
      if (session.status !== "completed") {
        await supabaseAdmin
          .from("standup_sessions")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", session.id);
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
