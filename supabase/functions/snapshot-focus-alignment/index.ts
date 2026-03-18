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

  try {
    const { team_id, period_start, period_end } = await req.json();
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

    // Default to last 7 days
    const end = period_end ? new Date(period_end) : new Date();
    const start = period_start
      ? new Date(period_start)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Fetch active focus items
    const { data: focusItems } = await supabase
      .from("team_focus")
      .select("id, title")
      .eq("team_id", team_id)
      .eq("is_active", true);

    const focusLabelMap = new Map<string, string>();
    for (const f of focusItems || []) {
      focusLabelMap.set(f.id, f.title);
    }

    // Fetch external_activity IDs in period (paginated)
    const extIds: string[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("external_activity")
        .select("id")
        .eq("team_id", team_id)
        .gte("occurred_at", startISO)
        .lte("occurred_at", endISO)
        .range(offset, offset + PAGE - 1);
      const rows = data || [];
      extIds.push(...rows.map((r: any) => r.id));
      if (rows.length < PAGE) break;
      offset += PAGE;
    }

    // Fetch commitment IDs in period
    const { data: commitRows } = await supabase
      .from("commitments")
      .select("id")
      .eq("team_id", team_id)
      .gte("created_at", startISO)
      .lte("created_at", endISO);
    const comIds = (commitRows || []).map((r: any) => r.id);

    const allIds = [...extIds, ...comIds];
    if (allIds.length === 0) {
      return new Response(JSON.stringify({ snapshots: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch classifications for those IDs (chunked)
    const allClassifications: any[] = [];
    for (let i = 0; i < allIds.length; i += 500) {
      const chunk = allIds.slice(i, i + 500);
      const { data } = await supabase
        .from("impact_classifications")
        .select("activity_id, member_id, focus_item_id")
        .eq("team_id", team_id)
        .in("activity_id", chunk);
      allClassifications.push(...(data || []));
    }

    // Build per-member breakdowns
    const memberTotals = new Map<string, Map<string, number>>();
    for (const c of allClassifications) {
      const label =
        c.focus_item_id && focusLabelMap.has(c.focus_item_id)
          ? focusLabelMap.get(c.focus_item_id)!
          : "Unaligned";
      if (!memberTotals.has(c.member_id)) {
        memberTotals.set(c.member_id, new Map());
      }
      const bd = memberTotals.get(c.member_id)!;
      bd.set(label, (bd.get(label) || 0) + 1);
    }

    // Upsert snapshots
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    let upserted = 0;

    for (const [memberId, labelCounts] of memberTotals) {
      const total = Array.from(labelCounts.values()).reduce((a, b) => a + b, 0);
      const breakdown: Record<string, number> = {};
      for (const [label, count] of labelCounts) {
        breakdown[label] = total > 0 ? Math.round((count / total) * 100) : 0;
      }

      const { error } = await supabase
        .from("focus_alignment_snapshots")
        .upsert(
          {
            team_id,
            member_id: memberId,
            period_start: startDate,
            period_end: endDate,
            breakdown,
            total_activities: total,
          },
          { onConflict: "team_id,member_id,period_start,period_end" }
        );

      if (!error) upserted++;
    }

    return new Response(JSON.stringify({ snapshots: upserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("snapshot-focus-alignment error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
