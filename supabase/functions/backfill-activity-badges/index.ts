import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveActivityBadge } from "../_shared/activity-badges.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let total = 0;
  let offset = 0;
  const BATCH = 500;

  while (true) {
    const { data: rows, error } = await sb
      .from("external_activity")
      .select("id, source, activity_type, title, metadata, team_id")
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rows || rows.length === 0) break;

    // Check which already have badges
    const ids = rows.map((r) => r.id);
    const { data: existing } = await sb
      .from("activity_badges")
      .select("activity_id")
      .in("activity_id", ids);

    const existingSet = new Set((existing || []).map((e) => e.activity_id));
    const toProcess = rows.filter((r) => !existingSet.has(r.id));

    if (toProcess.length > 0) {
      const badgeRows = toProcess.map((row) => {
        const resolution = resolveActivityBadge({
          source: row.source,
          activity_type: row.activity_type,
          title: row.title,
          metadata: row.metadata as Record<string, any> | undefined,
        });
        return {
          activity_id: row.id,
          source_type: "external_activity",
          team_id: row.team_id,
          badge_key: resolution.badge.key,
          badge_source: resolution.source,
          confidence: resolution.confidence,
        };
      });

      const { error: upsertError } = await sb
        .from("activity_badges")
        .upsert(badgeRows, { onConflict: "activity_id,source_type" });

      if (upsertError) {
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      total += badgeRows.length;
    }

    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  return new Response(
    JSON.stringify({ success: true, badges_created: total }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
