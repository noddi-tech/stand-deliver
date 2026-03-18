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
    const { team_id } = await req.json();
    if (!team_id) {
      return new Response(JSON.stringify({ error: "team_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Gather context in parallel
    const [activityRes, commitmentsRes, blockersRes, existingFocusRes] = await Promise.all([
      supabase
        .from("external_activity")
        .select("title, activity_type, source")
        .eq("team_id", team_id)
        .gte("occurred_at", fourteenDaysAgo)
        .order("occurred_at", { ascending: false })
        .limit(200),
      supabase
        .from("commitments")
        .select("title, status, priority, carry_count")
        .eq("team_id", team_id)
        .gte("created_at", fourteenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("blockers")
        .select("description, category, days_open, is_resolved")
        .eq("team_id", team_id)
        .eq("is_resolved", false)
        .limit(30),
      supabase
        .from("team_focus")
        .select("title, label, is_active")
        .eq("team_id", team_id)
        .eq("is_active", true),
    ]);

    const activity = activityRes.data || [];
    const commitments = commitmentsRes.data || [];
    const blockers = blockersRes.data || [];
    const existingFocus = existingFocusRes.data || [];

    if (activity.length === 0 && commitments.length === 0 && blockers.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context
    const contextParts: string[] = [];

    if (activity.length > 0) {
      // Group by source/type for conciseness
      const grouped: Record<string, string[]> = {};
      for (const a of activity) {
        const key = `${a.source}/${a.activity_type}`;
        if (!grouped[key]) grouped[key] = [];
        if (grouped[key].length < 10) grouped[key].push(a.title);
      }
      const lines = Object.entries(grouped)
        .map(([key, titles]) => `[${key}] (${titles.length} items):\n${titles.map(t => `  - ${t}`).join("\n")}`)
        .join("\n");
      contextParts.push(`Recent activity (14 days, ${activity.length} total):\n${lines}`);
    }

    if (commitments.length > 0) {
      const carried = commitments.filter(c => c.status === "carried" || c.carry_count > 0);
      const blocked = commitments.filter(c => c.status === "blocked");
      const active = commitments.filter(c => c.status === "active" || c.status === "in_progress");
      const parts: string[] = [];
      if (carried.length) parts.push(`Carried-over (${carried.length}): ${carried.slice(0, 8).map(c => c.title).join("; ")}`);
      if (blocked.length) parts.push(`Blocked (${blocked.length}): ${blocked.slice(0, 5).map(c => c.title).join("; ")}`);
      if (active.length) parts.push(`Active (${active.length}): ${active.slice(0, 8).map(c => c.title).join("; ")}`);
      contextParts.push(`Commitments:\n${parts.join("\n")}`);
    }

    if (blockers.length > 0) {
      contextParts.push(
        `Open blockers (${blockers.length}):\n${blockers.slice(0, 10).map(b => `- ${b.description} (${b.category}, ${b.days_open}d open)`).join("\n")}`
      );
    }

    if (existingFocus.length > 0) {
      contextParts.push(
        `ALREADY DEFINED focus areas (DO NOT suggest these):\n${existingFocus.map(f => `- "${f.title}" (tags: ${f.label})`).join("\n")}`
      );
    }

    const context = contextParts.join("\n\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a team productivity analyst. Based on a development team's recent activity from GitHub, ClickUp, standup commitments, and blockers, recommend 3-5 strategic focus areas the team should define.

Rules:
- Each suggestion needs a clear, concise title (under 60 chars) that describes the initiative
- Include 2-4 relevant tags (comma-separated) that would help classify related work
- Provide a brief reason (1-2 sentences) explaining WHY this should be a focus area based on the data
- Set priority: "high" if there are blockers or repeatedly-carried items related to it, "medium" for themes with significant activity, "low" for emerging patterns
- DO NOT suggest focus areas that already exist (listed under "ALREADY DEFINED")
- Focus on themes that emerge from the data: recurring work patterns, areas with blockers, heavily-carried items
- Make titles actionable and specific (e.g. "Stabilize payment processing" not "Fix bugs")`;

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
          { role: "user", content: `Here is the team's data from the last 14 days:\n\n${context}\n\nSuggest focus areas.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_focus_areas",
              description: "Return 3-5 strategic focus area recommendations for the team.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Focus area title (under 60 chars)" },
                        tags: { type: "string", description: "Comma-separated tags for classification" },
                        reason: { type: "string", description: "Why this should be a focus area" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                      },
                      required: ["title", "tags", "reason", "priority"],
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
        tool_choice: { type: "function", function: { name: "suggest_focus_areas" } },
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
    console.error("ai-recommend-focus error:", err);
    return new Response(JSON.stringify({ suggestions: [], error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
