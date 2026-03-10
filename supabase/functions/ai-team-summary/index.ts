import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { team_id, period = "7d" } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const days = parseInt(period) || 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const sinceDate = since.split("T")[0];

    // Fetch all data in parallel
    const [membersRes, commitmentsRes, blockersRes, sessionsRes, activityRes] = await Promise.all([
      supabase.from("team_members").select("id, user_id, role, profile:profiles(full_name)").eq("team_id", team_id).eq("is_active", true),
      supabase.from("commitments").select("*").eq("team_id", team_id).gte("created_at", since),
      supabase.from("blockers").select("*").eq("team_id", team_id).gte("created_at", since),
      supabase.from("standup_sessions").select("id, session_date").eq("team_id", team_id).gte("session_date", sinceDate),
      supabase.from("external_activity").select("*").eq("team_id", team_id).gte("occurred_at", since),
    ]);

    const members = membersRes.data || [];
    const commitments = commitmentsRes.data || [];
    const blockers = blockersRes.data || [];
    const sessions = sessionsRes.data || [];
    const activity = activityRes.data || [];

    // Get responses for these sessions
    const sessionIds = sessions.map(s => s.id);
    let responses: any[] = [];
    if (sessionIds.length > 0) {
      const { data } = await supabase.from("standup_responses").select("*").in("session_id", sessionIds);
      responses = data || [];
    }

    // Build per-member stats
    const memberStats = members.map(m => {
      const name = (m.profile as any)?.full_name || "Unknown";
      const mCommitments = commitments.filter(c => c.member_id === m.id);
      const mBlockers = blockers.filter(b => b.member_id === m.id);
      const mResponses = responses.filter(r => r.member_id === m.id);
      const mActivity = activity.filter(a => a.member_id === m.id);
      
      const total = mCommitments.length;
      const done = mCommitments.filter(c => c.status === "done").length;
      const carried = mCommitments.filter(c => c.carry_count > 0).length;
      const activeBlockers = mBlockers.filter(b => !b.is_resolved).length;
      const skippedDays = mResponses.filter(r => r.yesterday_text === "Skipped" && !r.mood).length;
      const standupCount = mResponses.length;
      const totalSessions = sessions.length;
      const participationRate = totalSessions > 0 ? Math.round((standupCount / totalSessions) * 100) : 0;
      
      // Mood summary
      const moods = mResponses.filter(r => r.mood).map(r => r.mood);
      const moodSummary = moods.length > 0 ? moods.join(", ") : "no mood data";

      // External activity breakdown
      const githubCommits = mActivity.filter(a => a.source === "github" && a.activity_type === "commit").length;
      const prs = mActivity.filter(a => a.source === "github" && (a.activity_type === "pr_opened" || a.activity_type === "pr_merged")).length;
      const clickupTasks = mActivity.filter(a => a.source === "clickup").length;

      return {
        name,
        role: m.role,
        commitments: { total, done, carried, completionRate: total > 0 ? Math.round((done / total) * 100) : 0 },
        activeBlockers,
        standup: { submitted: standupCount, skipped: skippedDays, participationRate, totalSessions },
        moods: moodSummary,
        externalActivity: { githubCommits, prs, clickupTasks },
      };
    });

    const prompt = `You are a direct, insightful team performance analyst for a standup tool called StandFlow. Analyze the following ${days}-day team data and provide honest, actionable insights. 

It's OK to celebrate wins explicitly ("crushing it", "strong velocity") AND flag concerns directly ("needs to step up", "going quiet", "may need a check-in"). Be specific with names and numbers.

Team data (${days} days):
${JSON.stringify(memberStats, null, 2)}

Total sessions in period: ${sessions.length}
Total team commitments: ${commitments.length}
Total team blockers: ${blockers.length} (${blockers.filter(b => !b.is_resolved).length} unresolved)`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You analyze team standup data. Be direct and specific." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "team_analysis",
            description: "Return structured team analysis",
            parameters: {
              type: "object",
              properties: {
                teamSummary: { type: "string", description: "2-3 sentence team-level narrative summary" },
                memberHighlights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      sentiment: { type: "string", enum: ["strong", "steady", "needs_attention"] },
                      highlight: { type: "string", description: "1-2 sentence specific highlight about this person" },
                    },
                    required: ["name", "sentiment", "highlight"],
                    additionalProperties: false,
                  },
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-3 actionable recommendations for the team lead",
                },
              },
              required: ["teamSummary", "memberHighlights", "recommendations"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "team_analysis" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await aiResponse.text();
      console.error("AI gateway error:", status, text);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let analysis;
    if (toolCall?.function?.arguments) {
      analysis = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: use the message content
      analysis = {
        teamSummary: aiData.choices?.[0]?.message?.content || "Unable to generate summary.",
        memberHighlights: [],
        recommendations: [],
      };
    }

    return new Response(JSON.stringify({ analysis, memberStats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-team-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
