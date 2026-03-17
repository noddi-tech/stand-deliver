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
  const BATCH = 100;

  while (true) {
    // Fetch external_activity rows that have no matching activity_badge
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

    for (const row of toProcess) {
      const resolution = resolveActivityBadge({
        source: row.source,
        activity_type: row.activity_type,
        title: row.title,
        metadata: row.metadata as Record<string, any> | undefined,
      });

      await sb.rpc("upsert_activity_badge", {
        p_activity_id: row.id,
        p_source_type: "external_activity",
        p_team_id: row.team_id,
        p_badge_key: resolution.badge.key,
        p_badge_source: resolution.source,
        p_confidence: resolution.confidence,
      });

      total++;
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
