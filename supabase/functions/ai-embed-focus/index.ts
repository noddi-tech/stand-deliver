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
    const { focus_item_id, team_id, content_override, content_type_override } = await req.json();
    if (!focus_item_id || !team_id) {
      throw new Error("Missing focus_item_id or team_id");
    }

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Determine content to embed
    let content: string;
    let contentType: string;

    if (content_override) {
      // Allow embedding arbitrary content (e.g. retrospective narrative)
      content = content_override;
      contentType = content_type_override || "narrative";
    } else {
      // Default: embed focus area title + description + label
      const { data: focusItem, error } = await sb
        .from("team_focus")
        .select("title, description, label")
        .eq("id", focus_item_id)
        .single();
      if (error || !focusItem) throw new Error("Focus item not found");

      content = [focusItem.title, focusItem.description || "", focusItem.label]
        .filter(Boolean)
        .join(" | ");
      contentType = "description";
    }

    // Call OpenAI embeddings API directly
    const embeddingResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: content,
      }),
    });

    if (!embeddingResp.ok) {
      const errBody = await embeddingResp.text();
      throw new Error(`OpenAI embeddings API error [${embeddingResp.status}]: ${errBody}`);
    }

    const embeddingResult = await embeddingResp.json();
    const embedding = embeddingResult.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Invalid embedding response from OpenAI");
    }

    // Upsert into focus_embeddings (unique on focus_item_id + content_type)
    const { error: upsertErr } = await sb
      .from("focus_embeddings")
      .upsert(
        {
          focus_item_id,
          team_id,
          content,
          content_type: contentType,
          embedding: JSON.stringify(embedding),
        },
        { onConflict: "focus_item_id,content_type" }
      );

    if (upsertErr) throw upsertErr;

    return new Response(
      JSON.stringify({ success: true, content_type: contentType, dimensions: embedding.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("ai-embed-focus error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
