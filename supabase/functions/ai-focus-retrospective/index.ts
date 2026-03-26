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
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const sb = createClient(supabaseUrl, serviceKey);

  let retroId: string | undefined;

  try {
    const { focus_item_id, team_id, retrospective_id, create_row } = await req.json();
    if (!focus_item_id || !team_id) {
      throw new Error("Missing focus_item_id or team_id");
    }

    retroId = retrospective_id;

    // Phase 0: Create or find the retrospective row
    if (create_row && !retroId) {
      const { data: newRow, error: insertErr } = await sb
        .from("focus_retrospectives")
        .insert({ focus_item_id, team_id, status: "pending" })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      retroId = newRow.id;
    }

    if (!retroId) {
      // Check if one already exists
      const { data: existing } = await sb
        .from("focus_retrospectives")
        .select("id")
        .eq("focus_item_id", focus_item_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        retroId = existing.id;
      } else {
        throw new Error("Missing retrospective_id and no existing row found");
      }
    }

    // Update status to generating
    await sb.from("focus_retrospectives").update({
      status: "generating",
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq("id", retroId);

    // ============================================================
    // PHASE 1: SQL Aggregation via focus_item_id joins
    // ============================================================

    const { data: focusItem } = await sb.from("team_focus").select("*").eq("id", focus_item_id).single();
    if (!focusItem) throw new Error("Focus item not found");

    // Get classifications linked to this focus item via focus_item_id
    const { data: classifications } = await sb
      .from("impact_classifications")
      .select("activity_id, member_id, value_type, impact_tier, source_type, reasoning")
      .eq("team_id", team_id)
      .eq("focus_item_id", focus_item_id);

    const classificationList = classifications || [];

    // Split by source_type
    const commitmentIds = classificationList
      .filter((c: any) => c.source_type === "commitment")
      .map((c: any) => c.activity_id);

    const extActivityIds = classificationList
      .filter((c: any) => c.source_type === "external_activity")
      .map((c: any) => c.activity_id);

    // Commitment stats (chunked for >500)
    let commitmentsByStatus: Record<string, number> = {};
    let totalCommitments = 0;
    let carryForwardCount = 0;

    for (let i = 0; i < commitmentIds.length; i += 500) {
      const chunk = commitmentIds.slice(i, i + 500);
      const { data: commitments } = await sb
        .from("commitments")
        .select("id, status, carry_count")
        .in("id", chunk);
      for (const c of commitments || []) {
        totalCommitments++;
        commitmentsByStatus[c.status] = (commitmentsByStatus[c.status] || 0) + 1;
        if (c.carry_count > 0) carryForwardCount++;
      }
    }

    // Blocker stats (linked to classified commitments)
    let blockerCategories: Record<string, number> = {};
    let totalBlockerDays = 0;
    let blockerCount = 0;

    for (let i = 0; i < commitmentIds.length; i += 500) {
      const chunk = commitmentIds.slice(i, i + 500);
      const { data: blockers } = await sb
        .from("blockers")
        .select("category, days_open, is_resolved")
        .eq("team_id", team_id)
        .in("commitment_id", chunk);
      for (const b of blockers || []) {
        blockerCount++;
        blockerCategories[b.category] = (blockerCategories[b.category] || 0) + 1;
        totalBlockerDays += b.days_open;
      }
    }

    // External activity breakdown
    let activityBySrc: Record<string, number> = {};
    for (let i = 0; i < extActivityIds.length; i += 500) {
      const chunk = extActivityIds.slice(i, i + 500);
      const { data: extActs } = await sb
        .from("external_activity")
        .select("source, activity_type")
        .in("id", chunk);
      for (const a of extActs || []) {
        const key = `${a.source}:${a.activity_type}`;
        activityBySrc[key] = (activityBySrc[key] || 0) + 1;
      }
    }

    // Effort distribution
    const effortByTier: Record<string, number> = {};
    const effortByValueType: Record<string, number> = {};
    for (const c of classificationList) {
      effortByTier[c.impact_tier] = (effortByTier[c.impact_tier] || 0) + 1;
      effortByValueType[c.value_type] = (effortByValueType[c.value_type] || 0) + 1;
    }

    // Contributor names
    const memberIds = [...new Set(classificationList.map((c: any) => c.member_id))];
    let memberNames: Record<string, string> = {};
    if (memberIds.length > 0) {
      const { data: members } = await sb
        .from("team_members")
        .select("id, profile:profiles!inner(full_name)")
        .eq("team_id", team_id)
        .in("id", memberIds);
      for (const m of (members || []) as any[]) {
        memberNames[m.id] = m.profile?.full_name || "Unknown";
      }
    }

    const completionRate = totalCommitments > 0
      ? Math.round(((commitmentsByStatus["done"] || 0) / totalCommitments) * 100)
      : 0;

    const carryForwardRate = totalCommitments > 0
      ? Math.round((carryForwardCount / totalCommitments) * 100)
      : 0;

    const metrics = {
      total_classifications: classificationList.length,
      total_commitments: totalCommitments,
      commitments_by_status: commitmentsByStatus,
      completion_rate: completionRate,
      carry_forward_rate: carryForwardRate,
      carry_forward_count: carryForwardCount,
      blocker_count: blockerCount,
      blocker_categories: blockerCategories,
      avg_blocker_days: blockerCount > 0 ? Math.round(totalBlockerDays / blockerCount) : 0,
      activity_by_source: activityBySrc,
      effort_by_tier: effortByTier,
      effort_by_value_type: effortByValueType,
      contributor_count: memberIds.length,
      contributors: Object.values(memberNames),
    };

    // ============================================================
    // PHASE 2: LLM Narrative via Lovable AI Gateway
    // ============================================================

    let narrative = "";
    let recommendations: any[] = [];

    if (lovableKey) {
      try {
        const prompt = `You are a team retrospective analyst. Generate a structured retrospective for a completed focus area.

Focus Area: "${focusItem.title}"
Description: ${focusItem.description || "No description provided"}
Tags: ${focusItem.label}

Metrics:
- Total classified activities: ${metrics.total_classifications}
- Total commitments: ${metrics.total_commitments}
- Completion rate: ${metrics.completion_rate}%
- Carry-forward rate: ${metrics.carry_forward_rate}%
- Blockers: ${metrics.blocker_count} (avg ${metrics.avg_blocker_days} days to resolve)
- Top blocker categories: ${JSON.stringify(metrics.blocker_categories)}
- Activity sources: ${JSON.stringify(metrics.activity_by_source)}
- Effort by impact tier: ${JSON.stringify(metrics.effort_by_tier)}
- Contributors: ${metrics.contributors.join(", ") || "None tracked"}

Generate a JSON response with these exact fields:
{
  "executive_summary": "2-3 sentence summary of what was accomplished",
  "what_shipped": "Paragraph describing key deliverables based on done commitments and high-impact activities",
  "what_blocked": "Paragraph about blockers, patterns, and resolution times",
  "recurring_patterns": "Paragraph about patterns noticed (carry-forwards, blocker types, effort distribution)",
  "where_we_got_lucky": "Paragraph about things that went well unexpectedly or risks that didn't materialize",
  "recommendations": [
    {"title": "recommendation title", "description": "actionable recommendation", "priority": "high|medium|low"}
  ]
}`;

        const resp = await fetch("https://ai.lovable.dev/chat/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a team retrospective analyst. Respond only with valid JSON." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (resp.status === 429) {
          throw new Error("Rate limited — please try again later");
        }
        if (resp.status === 402) {
          throw new Error("Credits exhausted — please add funds in workspace settings");
        }

        if (resp.ok) {
          const aiResult = await resp.json();
          const content = aiResult.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const sections = [
              `## Executive Summary\n${parsed.executive_summary || ""}`,
              `## What Shipped\n${parsed.what_shipped || ""}`,
              `## What Blocked\n${parsed.what_blocked || ""}`,
              `## Recurring Patterns\n${parsed.recurring_patterns || ""}`,
              `## Where We Got Lucky\n${parsed.where_we_got_lucky || ""}`,
            ];
            narrative = sections.join("\n\n");
            recommendations = parsed.recommendations || [];
          }
        } else {
          const errText = await resp.text();
          console.error("AI gateway error:", resp.status, errText);
        }
      } catch (aiErr: any) {
        // If it's a rate limit or credit error, re-throw to mark as failed
        if (aiErr.message?.includes("Rate limited") || aiErr.message?.includes("Credits exhausted")) {
          throw aiErr;
        }
        console.error("AI narrative generation failed:", aiErr);
      }
    }

    // Fallback narrative from metrics
    if (!narrative) {
      narrative = `## Executive Summary\nThis focus area had ${metrics.total_commitments} commitments with a ${metrics.completion_rate}% completion rate. ${metrics.blocker_count} blockers were encountered.`;
    }

    // ============================================================
    // PHASE 3: Store results
    // ============================================================

    const { error: updateErr } = await sb
      .from("focus_retrospectives")
      .update({
        status: "complete",
        metrics,
        ai_narrative: narrative,
        ai_recommendations: recommendations,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", retroId);

    if (updateErr) throw updateErr;

    // ============================================================
    // PHASE 4: Embed the retrospective narrative for semantic search
    // ============================================================
    try {
      const embedUrl = `${supabaseUrl}/functions/v1/ai-embed-focus`;
      await fetch(embedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          focus_item_id,
          team_id,
          content_override: `${focusItem.title} | ${narrative}`,
          content_type_override: "retrospective",
        }),
      });
    } catch (embedErr) {
      // Non-critical: log but don't fail the retrospective
      console.error("Embedding retrospective failed (non-critical):", embedErr);
    }

    // Also embed the focus area description if not already done
    try {
      const embedUrl = `${supabaseUrl}/functions/v1/ai-embed-focus`;
      await fetch(embedUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ focus_item_id, team_id }),
      });
    } catch (embedErr) {
      console.error("Embedding focus description failed (non-critical):", embedErr);
    }

    return new Response(JSON.stringify({ success: true, retrospective_id: retroId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ai-focus-retrospective error:", err);

    // Mark as failed with error message
    if (retroId) {
      try {
        await sb.from("focus_retrospectives").update({
          status: "failed",
          error_message: err.message || "Unknown error",
          updated_at: new Date().toISOString(),
        }).eq("id", retroId);
      } catch {}
    }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
