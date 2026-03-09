import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { commitments } = await req.json();
    if (!commitments || !Array.isArray(commitments) || commitments.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], overall_tip: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const titles = commitments.map((c: { title: string }) => c.title);

    const systemPrompt = `You are a standup coach. Review the user's daily standup commitments and provide actionable feedback. 

Rules:
- Focus items should be specific, actionable tasks — not broad domains ("work on backend" is bad, "implement user search API endpoint" is good)
- Ideal count is 3-5 items. More than 5 is too many, fewer than 2 may mean items are too broad
- Items should be completable within a day
- Flag overlapping items that could be merged
- Give positive reinforcement for well-written items (category: "good")
- Be concise and friendly

You MUST use the review_commitments tool to return your analysis.`;

    const userPrompt = `Review these standup commitments:\n${titles.map((t: string, i: number) => `${i + 1}. ${t}`).join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              name: "review_commitments",
              description: "Return structured feedback on standup commitments",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        original: { type: "string", description: "The original commitment text" },
                        category: {
                          type: "string",
                          enum: ["too_broad", "too_vague", "consider_splitting", "too_many_items", "good"],
                          description: "The type of issue found",
                        },
                        issue: { type: "string", description: "Brief explanation of the issue (or praise if good)" },
                        rewrite: {
                          type: "string",
                          description: "Suggested rewrite. For 'good' items, repeat the original. For 'consider_splitting', provide first suggested item.",
                        },
                      },
                      required: ["original", "category", "issue", "rewrite"],
                      additionalProperties: false,
                    },
                  },
                  overall_tip: {
                    type: "string",
                    description: "One-sentence overall tip for the standup",
                  },
                },
                required: ["suggestions", "overall_tip"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "review_commitments" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ suggestions: [], overall_tip: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-coach-standup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
