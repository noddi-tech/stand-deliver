import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { member_id, team_id } = await req.json();
    if (!member_id || !team_id) {
      return new Response(JSON.stringify({ error: "member_id and team_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Gather context in parallel
    const [activityRes, commitmentsRes, blockersRes] = await Promise.all([
      supabase
        .from("external_activity")
        .select("title, activity_type, source, occurred_at, external_url")
        .eq("member_id", member_id)
        .eq("team_id", team_id)
        .gte("occurred_at", sevenDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(30),
      supabase
        .from("commitments")
        .select("title, status, priority, carry_count, created_at, updated_at")
        .eq("member_id", member_id)
        .eq("team_id", team_id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("blockers")
        .select("description, category, days_open, is_resolved")
        .eq("member_id", member_id)
        .eq("team_id", team_id)
        .eq("is_resolved", false)
        .limit(10),
    ]);

    const activity = activityRes.data || [];
    const commitments = commitmentsRes.data || [];
    const blockers = blockersRes.data || [];

    // Build context summary
    const carriedItems = commitments.filter((c) => c.status === "carried" || c.carry_count > 0);
    const doneItems = commitments.filter((c) => c.status === "done");
    const activeItems = commitments.filter((c) => c.status === "active" || c.status === "in_progress");

    const contextParts: string[] = [];

    if (activity.length > 0) {
      const actSummary = activity
        .slice(0, 15)
        .map((a) => `- [${a.source}/${a.activity_type}] ${a.title}`)
        .join("\n");
      contextParts.push(`Recent activity (last 7 days):\n${actSummary}`);
    }

    if (doneItems.length > 0) {
      contextParts.push(
        `Recently completed:\n${doneItems.slice(0, 10).map((c) => `- ${c.title}`).join("\n")}`
      );
    }

    if (carriedItems.length > 0) {
      contextParts.push(
        `Carried-over items (unfinished from previous days):\n${carriedItems
          .map((c) => `- ${c.title} (carried ${c.carry_count}x, status: ${c.status})`)
          .join("\n")}`
      );
    }

    if (activeItems.length > 0) {
      contextParts.push(
        `Currently active/in-progress:\n${activeItems.map((c) => `- ${c.title} (${c.status})`).join("\n")}`
      );
    }

    if (blockers.length > 0) {
      contextParts.push(
        `Open blockers:\n${blockers.map((b) => `- ${b.description} (${b.category}, ${b.days_open}d open)`).join("\n")}`
      );
    }

    if (contextParts.length === 0) {
      // No data to analyze — return empty
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = contextParts.join("\n\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a smart daily standup assistant. Based on a developer's recent activity, commitments, and blockers, suggest 3-5 specific, actionable focus items for today.

Rules:
- Each suggestion should be a clear task title (not a vague goal)
- Prioritize: unresolved blockers > carried-over items > follow-ups on recent work > new work
- If something has been carried over multiple times, suggest breaking it into smaller tasks
- Include a brief reason explaining WHY this should be today's focus
- Set priority: "high" for blockers/repeatedly-carried items, "medium" for follow-ups, "low" for nice-to-haves
- Keep titles concise (under 80 chars) and actionable (start with a verb)
- Don't suggest things that are already done`;

    const userPrompt = `Here is the developer's context for today:\n\n${context}\n\nSuggest focus items for today's standup.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_focus_items",
              description: "Return 3-5 actionable focus suggestions for today's standup.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Concise, actionable task title" },
                        reason: { type: "string", description: "Brief explanation of why this matters today" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["title", "reason", "priority"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_focus_items" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();
      console.error(`AI gateway error: ${status} ${text}`);

      if (status === 429 || status === 402) {
        return new Response(
          JSON.stringify({ error: status === 429 ? "Rate limited, try again shortly" : "AI credits exhausted" }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response:", JSON.stringify(aiData));
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ suggestions: parsed.suggestions || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-suggest-focus error:", err);
    return new Response(JSON.stringify({ suggestions: [], error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
