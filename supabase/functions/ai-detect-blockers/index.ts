import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLOCKER_KEYWORDS = ["blocked", "waiting", "stuck", "depends on", "need from", "can't proceed", "holding up", "pending", "bottleneck"];

function keywordFallback(text: string): Array<{ description: string; category: string }> {
  const sentences = text.split(/[.!?\n]+/).filter(s => s.trim());
  const blockers: Array<{ description: string; category: string }> = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (BLOCKER_KEYWORDS.some(kw => lower.includes(kw))) {
      let category = "other";
      if (lower.includes("waiting") || lower.includes("depends on") || lower.includes("need from")) category = "dependency";
      else if (lower.includes("bug") || lower.includes("error") || lower.includes("broken")) category = "technical";
      else if (lower.includes("client") || lower.includes("vendor") || lower.includes("external")) category = "external";
      blockers.push({ description: sentence.trim(), category });
    }
  }
  return blockers;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { text } = await req.json();
    if (!text || text.trim().length === 0) {
      return new Response(JSON.stringify({ blockers: [], ai_available: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({
        blockers: keywordFallback(text),
        ai_available: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "You detect blockers and impediments from standup text. A blocker is anything preventing progress: dependencies on others, technical issues, unclear requirements, resource constraints, or external factors.",
          },
          {
            role: "user",
            content: `Detect any blockers in this standup text:\n\n${text}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "detect_blockers",
              description: "Extract blockers from standup text",
              parameters: {
                type: "object",
                properties: {
                  blockers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        category: { type: "string", enum: ["dependency", "technical", "external", "resource", "unclear_requirements", "other"] },
                      },
                      required: ["description", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["blockers"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "detect_blockers" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        const msg = response.status === 429 ? "Rate limited" : "AI credits exhausted";
        return new Response(JSON.stringify({ blockers: keywordFallback(text), ai_available: false, warning: msg }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await response.text();
      return new Response(JSON.stringify({ blockers: keywordFallback(text), ai_available: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ blockers: parsed.blockers, ai_available: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ blockers: keywordFallback(text), ai_available: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, ai_available: false }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
