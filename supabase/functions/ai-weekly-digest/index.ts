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
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);

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
      .select("status, carry_count, title, priority, member_id")
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

    // Compute core metrics
    const totalCommitments = commitments?.length || 0;
    const totalCompleted = commitments?.filter(c => c.status === "done").length || 0;
    const totalCarried = commitments?.filter(c => c.carry_count > 0).length || 0;
    const totalBlocked = blockers?.filter(b => !b.is_resolved).length || 0;
    const completionRate = totalCommitments > 0 ? Math.round((totalCompleted / totalCommitments) * 100) : 0;

    // Health score
    let healthScore = 50;
    if (completionRate > 80) healthScore += 25;
    else if (completionRate > 60) healthScore += 15;
    else if (completionRate < 30) healthScore -= 15;
    if (totalBlocked === 0) healthScore += 15;
    else if (totalBlocked > 3) healthScore -= 15;
    if (totalCarried > totalCommitments * 0.3) healthScore -= 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    // Work distribution — use activity_badges instead of title regex
    let workDist: Record<string, number> = {};
    try {
      const { data: badges } = await supabaseAdmin
        .from("activity_badges")
        .select("badge_key")
        .eq("team_id", team_id)
        .gte("created_at", monday.toISOString())
        .lte("created_at", sunday.toISOString());

      if (badges && badges.length > 0) {
        for (const b of badges) {
          workDist[b.badge_key] = (workDist[b.badge_key] || 0) + 1;
        }
      } else {
        // Fallback to title regex if no badges exist yet
        workDist = { feature: 0, bugfix: 0, tech_debt: 0, other: 0 };
        for (const c of commitments || []) {
          const lower = (c.title || "").toLowerCase();
          if (lower.includes("bug") || lower.includes("fix")) workDist.bugfix++;
          else if (lower.includes("refactor") || lower.includes("debt") || lower.includes("cleanup")) workDist.tech_debt++;
          else if (lower.includes("feature") || lower.includes("add") || lower.includes("implement") || lower.includes("build")) workDist.feature++;
          else workDist.other++;
        }
      }
    } catch (e) {
      console.error("Badge fetch error:", e);
    }

    // ---- Cross-platform activity ----
    const crossPlatform: Record<string, any> = { standflow: {}, github: {}, clickup: {} };
    crossPlatform.standflow = {
      commitments_made: totalCommitments,
      commitments_completed: totalCompleted,
      blockers_resolved: blockers?.filter(b => b.is_resolved).length || 0,
      blockers_unresolved: totalBlocked,
    };

    // Fetch GitHub activity for DORA metrics + awards
    let ghActivity: any[] = [];
    let lastWeekGhActivity: any[] = [];

    if (orgId) {
      try {
        const { data: ghInstall } = await supabaseAdmin
          .from("github_installations")
          .select("id")
          .eq("org_id", orgId)
          .maybeSingle();

        if (ghInstall) {
          const { data: teamMembers } = await supabaseAdmin
            .from("team_members")
            .select("user_id, id, profile:profiles!inner(full_name)")
            .eq("team_id", team_id)
            .eq("is_active", true);

          const memberIds = (teamMembers || []).map(m => m.id);

          // This week's activity
          const { data: thisWeekAct } = await supabaseAdmin
            .from("external_activity")
            .select("id, activity_type, member_id, metadata, occurred_at")
            .eq("team_id", team_id)
            .eq("source", "github")
            .gte("occurred_at", monday.toISOString())
            .lte("occurred_at", sunday.toISOString())
            .limit(1000);
          ghActivity = thisWeekAct || [];

          // Last week's activity (for trends)
          const { data: lastWeekAct } = await supabaseAdmin
            .from("external_activity")
            .select("id, activity_type, member_id, metadata, occurred_at")
            .eq("team_id", team_id)
            .eq("source", "github")
            .gte("occurred_at", lastMonday.toISOString())
            .lt("occurred_at", monday.toISOString())
            .limit(1000);
          lastWeekGhActivity = lastWeekAct || [];

          // Aggregate for cross-platform card
          let totalCommitsGH = 0, totalPrsOpened = 0, totalPrsMerged = 0, totalReviews = 0;
          const allRepos = new Set<string>();
          for (const a of ghActivity) {
            if (a.activity_type === "commit") totalCommitsGH++;
            if (a.activity_type === "pr_opened") totalPrsOpened++;
            if (a.activity_type === "pr_merged") totalPrsMerged++;
            if (a.activity_type === "pr_review") totalReviews++;
            const meta = a.metadata as any;
            if (meta?.repo) allRepos.add(meta.repo);
          }
          crossPlatform.github = {
            commits: totalCommitsGH,
            prs_opened: totalPrsOpened,
            prs_merged: totalPrsMerged,
            reviews: totalReviews,
            top_repos: Array.from(allRepos).slice(0, 8),
          };

          // ---- DORA Metrics ----
          function computeCycleTimes(prs: any[]): number[] {
            const times: number[] = [];
            for (const pr of prs.filter(p => p.activity_type === "pr_merged")) {
              const meta = pr.metadata as any;
              if (meta?.created_at && meta?.merged_at) {
                const hours = (new Date(meta.merged_at).getTime() - new Date(meta.created_at).getTime()) / 3600000;
                if (hours >= 0 && hours < 720) times.push(hours);
              }
            }
            return times;
          }

          const thisWeekCycles = computeCycleTimes(ghActivity);
          const lastWeekCycles = computeCycleTimes(lastWeekGhActivity);
          const thisWeekAvgCycle = thisWeekCycles.length > 0 ? Math.round(thisWeekCycles.reduce((a, b) => a + b, 0) / thisWeekCycles.length * 10) / 10 : null;
          const lastWeekAvgCycle = lastWeekCycles.length > 0 ? Math.round(lastWeekCycles.reduce((a, b) => a + b, 0) / lastWeekCycles.length * 10) / 10 : null;

          function computeReviewTurnaround(acts: any[]): number | null {
            const times: number[] = [];
            for (const pr of acts.filter(p => p.activity_type === "pr_opened")) {
              const meta = pr.metadata as any;
              if (meta?.created_at && meta?.first_review_at) {
                const hours = (new Date(meta.first_review_at).getTime() - new Date(meta.created_at).getTime()) / 3600000;
                if (hours >= 0 && hours < 720) times.push(hours);
              }
            }
            return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length * 10) / 10 : null;
          }

          const doraMetrics = {
            avg_pr_cycle_time: thisWeekAvgCycle,
            pr_merge_rate: totalPrsMerged,
            review_turnaround: computeReviewTurnaround(ghActivity),
            trends: {
              cycle_time: thisWeekAvgCycle !== null && lastWeekAvgCycle !== null
                ? (lastWeekAvgCycle < thisWeekAvgCycle ? "up" : lastWeekAvgCycle > thisWeekAvgCycle ? "down" : "flat")
                : "flat",
              merge_rate: totalPrsMerged > (lastWeekGhActivity.filter(a => a.activity_type === "pr_merged").length)
                ? "up" : totalPrsMerged < (lastWeekGhActivity.filter(a => a.activity_type === "pr_merged").length) ? "down" : "flat",
              reviews: totalReviews > (lastWeekGhActivity.filter(a => a.activity_type === "pr_review").length) ? "up" : totalReviews < (lastWeekGhActivity.filter(a => a.activity_type === "pr_review").length) ? "down" : "flat",
            },
          };

          crossPlatform.dora_metrics = doraMetrics;

          // ---- Weekly Awards (VIS-based) ----
          const memberNameMap = new Map<string, string>();
          for (const tm of teamMembers || []) {
            memberNameMap.set(tm.id, (tm as any).profile?.full_name || "Unknown");
          }

          // Fetch VIS impact classifications for this week and last week
          const { data: thisWeekClassifications } = await supabaseAdmin
            .from("impact_classifications")
            .select("member_id, impact_score")
            .eq("team_id", team_id)
            .gte("created_at", monday.toISOString())
            .lte("created_at", sunday.toISOString());

          const { data: lastWeekClassifications } = await supabaseAdmin
            .from("impact_classifications")
            .select("member_id, impact_score")
            .eq("team_id", team_id)
            .gte("created_at", lastMonday.toISOString())
            .lt("created_at", monday.toISOString());

          // Build VIS score maps
          const thisWeekVIS = new Map<string, number>();
          for (const c of thisWeekClassifications || []) {
            thisWeekVIS.set(c.member_id, (thisWeekVIS.get(c.member_id) || 0) + Number(c.impact_score));
          }
          const lastWeekVIS = new Map<string, number>();
          for (const c of lastWeekClassifications || []) {
            lastWeekVIS.set(c.member_id, (lastWeekVIS.get(c.member_id) || 0) + Number(c.impact_score));
          }

          interface MemberScore { name: string; impactScore: number; reviews: number; completions: number; prsOpened: number; }
          const thisWeekScores = new Map<string, MemberScore>();
          const lastWeekScores = new Map<string, MemberScore>();

          function populateScores(acts: any[], scores: Map<string, MemberScore>, visMap: Map<string, number>) {
            for (const a of acts) {
              if (!scores.has(a.member_id)) {
                scores.set(a.member_id, {
                  name: memberNameMap.get(a.member_id) || "Unknown",
                  impactScore: 0,
                  reviews: 0,
                  completions: 0,
                  prsOpened: 0,
                });
              }
              const s = scores.get(a.member_id)!;
              if (a.activity_type === "pr_review") s.reviews++;
              else if (a.activity_type === "pr_opened") s.prsOpened++;
            }
            // Apply VIS scores
            for (const [memberId, visScore] of visMap) {
              if (!scores.has(memberId)) {
                scores.set(memberId, {
                  name: memberNameMap.get(memberId) || "Unknown",
                  impactScore: 0,
                  reviews: 0,
                  completions: 0,
                  prsOpened: 0,
                });
              }
              scores.get(memberId)!.impactScore = Math.round(visScore);
            }
          }

          populateScores(ghActivity, thisWeekScores, thisWeekVIS);
          populateScores(lastWeekGhActivity, lastWeekScores, lastWeekVIS);

          // Normalize impact scores to 0-100 using team median (matches client useWeeklyAwards)
          function normalizeImpactScores(scores: Map<string, any>) {
            const rawScores = Array.from(scores.values())
              .map(s => s.impactScore)
              .filter(v => v > 0)
              .sort((a: number, b: number) => a - b);
            let teamMedian = 1;
            if (rawScores.length > 0) {
              const mid = Math.floor(rawScores.length / 2);
              teamMedian = rawScores.length % 2 === 1
                ? rawScores[mid]
                : (rawScores[mid - 1] + rawScores[mid]) / 2;
              if (teamMedian === 0) teamMedian = 1;
            }
            for (const s of scores.values()) {
              s.impactScore = s.impactScore > 0
                ? Math.round(Math.min(100, (s.impactScore / teamMedian) * 50))
                : 0;
            }
          }
          normalizeImpactScores(thisWeekScores);
          normalizeImpactScores(lastWeekScores);

          // Add commitment completions
          for (const c of commitments || []) {
            if (c.status === "done") {
              const s = thisWeekScores.get(c.member_id);
              if (s) s.completions++;
            }
          }

          const weeklyAwards: any[] = [];
          const members = Array.from(thisWeekScores.entries())
            .map(([id, s]) => ({ id, ...s }))
            .filter(m => m.impactScore + m.reviews + m.completions > 0);

          if (members.length > 0) {
            // MVP — same composite as useWeeklyAwards: VIS impact + reviews*20 + completions*15
            const mvp = members.reduce((best, m) => {
              const score = m.impactScore + m.reviews * 20 + m.completions * 15;
              const bestScore = best.impactScore + best.reviews * 20 + best.completions * 15;
              return score > bestScore ? m : best;
            });
            const mvpScore = mvp.impactScore + mvp.reviews * 20 + mvp.completions * 15;
            if (mvpScore > 0) {
              weeklyAwards.push({
                type: "mvp",
                emoji: "🏆",
                title: "MVP",
                member_name: mvp.name,
                member_id: mvp.id,
                description: "Highest composite of VIS impact, reviews, and commitments completed",
                stat: `Impact: ${mvp.impactScore}/100 · Reviews: ${mvp.reviews} · Done: ${mvp.completions}`,
              });
            }

            // Unsung Hero
            const hero = members
              .filter(m => m.reviews >= 2 && m.id !== mvp.id)
              .reduce<typeof members[0] | null>((best, m) => {
                const ratio = m.reviews / Math.max(m.prsOpened, 1);
                const bestRatio = best ? best.reviews / Math.max(best.prsOpened, 1) : 0;
                return ratio > bestRatio ? m : best;
              }, null);
            if (hero) {
              weeklyAwards.push({
                type: "unsung_hero",
                emoji: "🦸",
                title: "Unsung Hero",
                member_name: hero.name,
                member_id: hero.id,
                description: "Most reviews given relative to own PRs — lifting others up",
                stat: `${hero.reviews} reviews given · ${hero.prsOpened} PRs opened`,
              });
            }

            // Momentum
            let bestImprovement = 0.2;
            let momentumMember: typeof members[0] | null = null;
            for (const m of members) {
              if (m.id === mvp.id) continue;
              const lastWeek = lastWeekScores.get(m.id);
              const lastScore = lastWeek ? lastWeek.impactScore + lastWeek.reviews * 20 + lastWeek.completions * 15 : 0;
              const thisScore = m.impactScore + m.reviews * 20 + m.completions * 15;
              const improvement = lastScore > 0 ? (thisScore - lastScore) / lastScore : thisScore > 30 ? 1 : 0;
              if (improvement > bestImprovement) {
                bestImprovement = improvement;
                momentumMember = m;
              }
            }
            if (momentumMember) {
              weeklyAwards.push({
                type: "momentum",
                emoji: "🚀",
                title: "Momentum",
                member_name: momentumMember.name,
                member_id: momentumMember.id,
                description: "Biggest week-over-week improvement in output",
                stat: `+${Math.round(bestImprovement * 100)}% vs last week`,
              });
            }
          }

          crossPlatform.weekly_awards = weeklyAwards;

          // Badge impact percentages for historical view
          try {
            const activityIds = ghActivity.map(a => a.id);
            if (activityIds.length > 0) {
              const { data: badgesWithImpact } = await supabaseAdmin
                .from("activity_badges")
                .select("badge_key, activity_id")
                .eq("team_id", team_id)
                .in("activity_id", activityIds);

              const { data: classifications } = await supabaseAdmin
                .from("impact_classifications")
                .select("activity_id, impact_score")
                .eq("team_id", team_id)
                .in("activity_id", activityIds);

              if (badgesWithImpact && classifications) {
                const impactMap = new Map<string, number>();
                for (const c of classifications) {
                  impactMap.set(c.activity_id, (impactMap.get(c.activity_id) || 0) + Number(c.impact_score));
                }

                const badgeImpact: Record<string, number> = {};
                let totalImpact = 0;
                for (const b of badgesWithImpact) {
                  const score = impactMap.get(b.activity_id) || 0;
                  badgeImpact[b.badge_key] = (badgeImpact[b.badge_key] || 0) + score;
                  totalImpact += score;
                }

                if (totalImpact > 0) {
                  const badgeImpactPct: Record<string, number> = {};
                  for (const [key, val] of Object.entries(badgeImpact)) {
                    badgeImpactPct[key] = Math.round((val / totalImpact) * 100);
                  }
                  crossPlatform.badge_impact_pct = badgeImpactPct;
                }
              }
            }
          } catch (e) {
            console.error("Badge impact computation error:", e);
          }
        }
      } catch (e) {
        console.error("GitHub/DORA integration error:", e);
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
        const gh = crossPlatform.github || {};
        if (gh.commits > 0 || gh.prs_opened > 0) {
          crossPlatformContext += `\nGitHub Activity:\n- ${gh.commits} commits across ${gh.top_repos?.length || 0} repos (${(gh.top_repos || []).join(", ")})\n- ${gh.prs_opened} PRs opened, ${gh.prs_merged} merged\n- ${gh.reviews} code reviews completed`;
        }
        const cu = crossPlatform.clickup || {};
        if (cu.tasks_tracked > 0) {
          crossPlatformContext += `\nClickUp Activity:\n- ${cu.tasks_tracked} tasks tracked, ${cu.tasks_completed} completed`;
        }

        const dora = crossPlatform.dora_metrics;
        let doraContext = "";
        if (dora) {
          doraContext = `\nEngineering Metrics:\n- Avg PR Cycle Time: ${dora.avg_pr_cycle_time !== null ? dora.avg_pr_cycle_time + "h" : "N/A"}\n- PRs Merged This Week: ${dora.pr_merge_rate}\n- Avg Review Turnaround: ${dora.review_turnaround !== null ? dora.review_turnaround + "h" : "N/A"}\n- Cycle Time Trend: ${dora.trends?.cycle_time || "flat"}`;
        }

        const awardsCtx = (crossPlatform.weekly_awards || []).map((a: any) => `- ${a.emoji} ${a.title}: ${a.member_name} (${a.stat})`).join("\n");

        const context = `Team: ${team?.name || "Unknown"}
Week: ${weekStart} to ${weekEnd}
Commitments: ${totalCommitments} total, ${totalCompleted} completed, ${totalCarried} carried over
Blockers: ${totalBlocked} unresolved out of ${blockers?.length || 0} total
Completion rate: ${completionRate}%
Health score: ${healthScore}/100
Work distribution: ${JSON.stringify(workDist)}${crossPlatformContext}${doraContext}
${awardsCtx ? `\nWeekly Awards:\n${awardsCtx}` : ""}`;

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
                content: "You generate weekly team health digests. Be warm, supportive, and actionable. Never rank individuals negatively. Frame concerns as questions, not judgments. When cross-platform data (GitHub, ClickUp) is available, weave it into the narrative naturally. When weekly awards are present, celebrate them warmly but briefly. When DORA/engineering metrics are available, mention trends naturally.",
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
        weekly_awards: crossPlatform.weekly_awards || [],
        dora_metrics: crossPlatform.dora_metrics || {},
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

          const gh = crossPlatform.github || {};
          if (gh.commits > 0 || gh.prs_opened > 0) {
            slackText += `\n\n🐙 *GitHub*: ${gh.commits} commits, ${gh.prs_opened} PRs opened, ${gh.prs_merged} merged, ${gh.reviews} reviews`;
          }

          const dora = crossPlatform.dora_metrics;
          if (dora?.avg_pr_cycle_time !== null && dora?.avg_pr_cycle_time !== undefined) {
            slackText += `\n⏱ *PR Cycle Time*: ${dora.avg_pr_cycle_time}h avg`;
          }

          const awards = crossPlatform.weekly_awards || [];
          if (awards.length > 0) {
            slackText += `\n\n🏅 *Weekly Awards*`;
            for (const a of awards) {
              slackText += `\n${a.emoji} *${a.title}*: ${a.member_name} — ${a.stat}`;
            }
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
