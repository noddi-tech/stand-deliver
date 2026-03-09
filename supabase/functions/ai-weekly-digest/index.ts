import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate week boundaries (Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const weekStart = monday.toISOString().split("T")[0];
    const weekEnd = sunday.toISOString().split("T")[0];

    // Fetch team info
    const { data: team } = await supabaseAdmin
      .from("teams")
      .select("name, slack_channel_id, org_id")
      .eq("id", team_id)
      .single();

    const orgId = team?.org_id;

    // Fetch week's commitments
    const { data: commitments } = await supabaseAdmin
      .from("commitments")
      .select("status, carry_count, title, priority")
      .eq("team_id", team_id)
      .gte("created_at", monday.toISOString())
      .lte("created_at", sunday.toISOString());

    // Fetch week's blockers
    const { data: blockers } = await supabaseAdmin
      .from("blockers")
      .select("category, is_resolved, description")
      .eq("team_id", team_id)
      .gte("created_at", monday.toISOString())
      .lte("created_at", sunday.toISOString());

    // Compute metrics
    const totalCommitments = commitments?.length || 0;
    const totalCompleted = commitments?.filter(c => c.status === "done").length || 0;
    const totalCarried = commitments?.filter(c => c.carry_count > 0).length || 0;
    const totalBlocked = blockers?.filter(b => !b.is_resolved).length || 0;
    const completionRate = totalCommitments > 0 ? Math.round((totalCompleted / totalCommitments) * 100) : 0;

    // Health score (0-100)
    let healthScore = 50;
    if (completionRate > 80) healthScore += 25;
    else if (completionRate > 60) healthScore += 15;
    else if (completionRate < 30) healthScore -= 15;
    if (totalBlocked === 0) healthScore += 15;
    else if (totalBlocked > 3) healthScore -= 15;
    if (totalCarried > totalCommitments * 0.3) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Work distribution
    const workDist: Record<string, number> = { feature: 0, bugfix: 0, tech_debt: 0, other: 0 };
    for (const c of commitments || []) {
      const lower = (c.title || "").toLowerCase();
      if (lower.includes("bug") || lower.includes("fix")) workDist.bugfix++;
      else if (lower.includes("refactor") || lower.includes("debt") || lower.includes("cleanup")) workDist.tech_debt++;
      else if (lower.includes("feature") || lower.includes("add") || lower.includes("implement") || lower.includes("build")) workDist.feature++;
      else workDist.other++;
    }

    // ---- Cross-platform activity ----
    const crossPlatform: Record<string, any> = { standflow: {}, github: {}, clickup: {} };

    // StandFlow activity
    crossPlatform.standflow = {
      commitments_made: totalCommitments,
      commitments_completed: totalCompleted,
      blockers_resolved: blockers?.filter(b => b.is_resolved).length || 0,
      blockers_unresolved: totalBlocked,
    };

    // GitHub activity
    if (orgId) {
      try {
        const { data: ghInstall } = await supabaseAdmin
          .from("github_installations")
          .select("id")
          .eq("org_id", orgId)
          .maybeSingle();

        if (ghInstall) {
          // Get team members with github mappings
          const { data: teamMembers } = await supabaseAdmin
            .from("team_members")
            .select("user_id")
            .eq("team_id", team_id)
            .eq("is_active", true);

          const userIds = (teamMembers || []).map(m => m.user_id);
          const { data: ghMappings } = await supabaseAdmin
            .from("github_user_mappings")
            .select("github_username")
            .eq("org_id", orgId)
            .in("user_id", userIds);

          let totalCommits = 0, totalPrsOpened = 0, totalPrsMerged = 0, totalReviews = 0;
          const allRepos = new Set<string>();

          for (const mapping of ghMappings || []) {
            try {
              const actRes = await fetch(
                `${Deno.env.get("SUPABASE_URL")}/functions/v1/github-fetch-activity`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    org_id: orgId,
                    github_username: mapping.github_username,
                    week_start: weekStart,
                    week_end: weekEnd,
                  }),
                }
              );
              if (actRes.ok) {
                const act = await actRes.json();
                totalCommits += act.commits || 0;
                totalPrsOpened += act.prs_opened || 0;
                totalPrsMerged += act.prs_merged || 0;
                totalReviews += act.reviews || 0;
                for (const r of act.top_repos || []) allRepos.add(r);
              }
            } catch (e) {
              console.error(`GitHub fetch failed for ${mapping.github_username}:`, e);
            }
          }

          crossPlatform.github = {
            commits: totalCommits,
            prs_opened: totalPrsOpened,
            prs_merged: totalPrsMerged,
            reviews: totalReviews,
            top_repos: Array.from(allRepos).slice(0, 8),
          };
        }
      } catch (e) {
        console.error("GitHub integration error:", e);
      }
    }

    // ClickUp activity
    if (orgId) {
      try {
        const { data: cuInstall } = await supabaseAdmin
          .from("clickup_installations")
          .select("id")
          .eq("org_id", orgId)
          .maybeSingle();

        if (cuInstall) {
          // Count commitments that came from ClickUp (have clickup_task_id)
          const clickupCommitments = (commitments || []).filter(c => (c as any).clickup_task_id);
          crossPlatform.clickup = {
            tasks_tracked: clickupCommitments.length,
            tasks_completed: clickupCommitments.filter(c => c.status === "done").length,
          };
        }
      } catch (e) {
        console.error("ClickUp integration error:", e);
      }
    }

    // Generate AI narrative
    let aiNarrative = "";
    let aiRecommendations: any[] = [];
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY) {
      try {
        let crossPlatformContext = "";
        const gh = crossPlatform.github;
        if (gh.commits > 0 || gh.prs_opened > 0) {
          crossPlatformContext += `\nGitHub Activity:\n- ${gh.commits} commits across ${gh.top_repos?.length || 0} repos (${(gh.top_repos || []).join(", ")})\n- ${gh.prs_opened} PRs opened, ${gh.prs_merged} merged\n- ${gh.reviews} code reviews completed`;
        }
        const cu = crossPlatform.clickup;
        if (cu.tasks_tracked > 0) {
          crossPlatformContext += `\nClickUp Activity:\n- ${cu.tasks_tracked} tasks tracked, ${cu.tasks_completed} completed`;
        }

        const context = `Team: ${team?.name || "Unknown"}
Week: ${weekStart} to ${weekEnd}
Commitments: ${totalCommitments} total, ${totalCompleted} completed, ${totalCarried} carried over
Blockers: ${totalBlocked} unresolved out of ${blockers?.length || 0} total
Completion rate: ${completionRate}%
Health score: ${healthScore}/100
Work distribution: ${JSON.stringify(workDist)}${crossPlatformContext}`;

        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content: "You generate weekly team health digests. Be warm, supportive, and actionable. Never rank individuals. Frame concerns as questions, not judgments. When cross-platform data (GitHub, ClickUp) is available, weave it into the narrative naturally.",
              },
              { role: "user", content: `Generate a weekly digest narrative and 3-5 recommendations:\n\n${context}` },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "generate_digest",
                  description: "Generate weekly digest with narrative and recommendations",
                  parameters: {
                    type: "object",
                    properties: {
                      narrative: { type: "string", description: "3-5 sentence weekly narrative" },
                      recommendations: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            priority: { type: "string", enum: ["high", "medium", "low"] },
                          },
                          required: ["title", "description", "priority"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["narrative", "recommendations"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "generate_digest" } },
          }),
        });

        if (aiResponse.ok) {
          const result = await aiResponse.json();
          const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            aiNarrative = parsed.narrative || "";
            aiRecommendations = parsed.recommendations || [];
          }
        } else {
          await aiResponse.text();
        }
      } catch (e) {
        console.error("AI call failed:", e);
      }
    }

    if (!aiNarrative) {
      aiNarrative = `This week the team handled ${totalCommitments} commitments with a ${completionRate}% completion rate. ${totalBlocked > 0 ? `There are ${totalBlocked} unresolved blockers that may need attention.` : "No blockers remain unresolved."} ${totalCarried > 0 ? `${totalCarried} items were carried over from previous sessions.` : ""}`;
    }

    // Upsert digest
    const { data: digest, error: digestError } = await supabaseAdmin
      .from("ai_weekly_digests")
      .upsert({
        team_id,
        week_start: weekStart,
        week_end: weekEnd,
        health_score: healthScore,
        completion_rate: completionRate,
        total_commitments: totalCommitments,
        total_completed: totalCompleted,
        total_carried: totalCarried,
        total_blocked: totalBlocked,
        ai_narrative: aiNarrative,
        ai_recommendations: aiRecommendations,
        work_distribution: workDist,
        cross_platform_activity: crossPlatform,
        top_themes: [],
      }, { onConflict: "team_id,week_start" })
      .select()
      .single();

    if (digestError) throw digestError;

    // Post to Slack if configured
    if (team?.slack_channel_id) {
      try {
        const { data: installation } = await supabaseAdmin
          .from("slack_installations")
          .select("bot_token")
          .eq("org_id", team.org_id)
          .limit(1)
          .single();

        if (installation?.bot_token) {
          let slackText = `📊 *Weekly Digest — ${weekStart} to ${weekEnd}*\n\n🏥 Health Score: ${healthScore}/100\n✅ Completion Rate: ${completionRate}%\n\n${aiNarrative}`;

          const gh = crossPlatform.github;
          if (gh.commits > 0 || gh.prs_opened > 0) {
            slackText += `\n\n🐙 *GitHub*: ${gh.commits} commits, ${gh.prs_opened} PRs opened, ${gh.prs_merged} merged, ${gh.reviews} reviews`;
          }

          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${installation.bot_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: team.slack_channel_id,
              text: slackText,
            }),
          });
        }
      } catch (e) {
        console.error("Slack post failed:", e);
      }
    }

    return new Response(JSON.stringify({ digest, ai_available: !!LOVABLE_API_KEY }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
