import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { search_text, team_id, exclude_id, limit = 5 } = await req.json();
    if (!search_text || !team_id) {
      throw new Error("Missing search_text or team_id");
    }

    if (!openaiKey) {
      // No OpenAI key: return empty so frontend falls back to pg_trgm
      return new Response(JSON.stringify({ results: [], fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if any embeddings exist for this team
    const { count } = await sb
      .from("focus_embeddings")
      .select("id", { count: "exact", head: true })
      .eq("team_id", team_id);

    if (!count || count === 0) {
      return new Response(JSON.stringify({ results: [], fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate embedding for the search text
    const embeddingResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: search_text,
      }),
    });

    if (!embeddingResp.ok) {
      console.error("OpenAI embedding failed:", embeddingResp.status);
      return new Response(JSON.stringify({ results: [], fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const embeddingResult = await embeddingResp.json();
    const queryEmbedding = embeddingResult.data?.[0]?.embedding;
    if (!queryEmbedding) {
      return new Response(JSON.stringify({ results: [], fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call match_focus_embeddings RPC
    const { data: matches, error } = await sb.rpc("match_focus_embeddings", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_team_id: team_id,
      match_threshold: 0.3,
      match_count: limit,
    });

    if (error) {
      console.error("match_focus_embeddings error:", error);
      return new Response(JSON.stringify({ results: [], fallback: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full focus area details for matched items
    const focusIds = [...new Set((matches || []).map((m: any) => m.focus_item_id))];
    if (focusIds.length === 0) {
      return new Response(JSON.stringify({ results: [], fallback: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: focusItems } = await sb
      .from("team_focus")
      .select("id, title, description, label, completed_at")
      .in("id", focusIds)
      .not("completed_at", "is", null);

    // Filter out excluded ID and merge similarity scores
    const similarityMap = new Map<string, number>();
    for (const m of matches || []) {
      const existing = similarityMap.get(m.focus_item_id) || 0;
      similarityMap.set(m.focus_item_id, Math.max(existing, m.similarity));
    }

    const results = (focusItems || [])
      .filter((f: any) => !exclude_id || f.id !== exclude_id)
      .map((f: any) => ({
        id: f.id,
        title: f.title,
        description: f.description,
        label: f.label,
        completed_at: f.completed_at,
        similarity: similarityMap.get(f.id) || 0,
      }))
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, limit);

    return new Response(JSON.stringify({ results, fallback: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("search-focus-embeddings error:", err);
    return new Response(JSON.stringify({ results: [], fallback: true, error: err.message }), {
      status: 200, // Return 200 so frontend can fall back gracefully
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
