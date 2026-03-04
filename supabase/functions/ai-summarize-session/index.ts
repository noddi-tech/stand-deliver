import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id required");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get session with team
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("standup_sessions")
      .select("id, session_date, team_id, status, teams(name, slack_channel_id, org_id)")
      .eq("id", session_id)
      .single();

    if (sessionError || !session) throw new Error("Session not found");

    // Get responses with member info
    const { data: responses } = await supabaseAdmin
      .from("standup_responses")
      .select("yesterday_text, today_text, blockers_text, mood, team_members(profiles(full_name))")
      .eq("session_id", session_id);

    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({ summary: "No responses submitted for this session.", ai_available: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context for AI
    const responseTexts = responses.map((r: any) => {
      const name = r.team_members?.profiles?.full_name || "A team member";
      let text = `${name}:`;
      if (r.yesterday_text) text += ` Done: ${r.yesterday_text}.`;
      if (r.today_text) text += ` Today: ${r.today_text}.`;
      if (r.blockers_text) text += ` Blockers: ${r.blockers_text}.`;
      if (r.mood) text += ` Mood: ${r.mood}.`;
      return text;
    }).join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let summary = "";

    if (LOVABLE_API_KEY) {
      try {
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
                content: "You generate concise, warm team standup summaries. Write 3-5 sentences highlighting key themes, progress, blockers, and team mood. Use a supportive tone. Do not list individual names.",
              },
              {
                role: "user",
                content: `Summarize this team standup for ${(session.teams as any)?.name || "the team"} on ${session.session_date}:\n\n${responseTexts}`,
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const result = await aiResponse.json();
          summary = result.choices?.[0]?.message?.content || "";
        } else {
          await aiResponse.text();
        }
      } catch (e) {
        console.error("AI call failed:", e);
      }
    }

    // Fallback summary
    if (!summary) {
      const blockerCount = responses.filter((r: any) => r.blockers_text).length;
      summary = `${responses.length} team members submitted their standup. ${blockerCount > 0 ? `${blockerCount} reported blockers that may need attention.` : "No blockers were reported."} The team is making progress on their commitments.`;
    }

    // Store summary
    await supabaseAdmin
      .from("standup_sessions")
      .update({ ai_summary: summary })
      .eq("id", session_id);

    // Post to Slack if configured
    const team = session.teams as any;
    if (team?.slack_channel_id) {
      try {
        const { data: installation } = await supabaseAdmin
          .from("slack_installations")
          .select("bot_token")
          .eq("org_id", team.org_id)
          .limit(1)
          .single();

        if (installation?.bot_token) {
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${installation.bot_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: team.slack_channel_id,
              text: `✨ *AI Standup Summary — ${session.session_date}*\n\n${summary}`,
            }),
          });
        }
      } catch (e) {
        console.error("Slack post failed:", e);
      }
    }

    return new Response(JSON.stringify({ summary, ai_available: !!LOVABLE_API_KEY }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
