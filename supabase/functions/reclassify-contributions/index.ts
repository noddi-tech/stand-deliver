import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { team_id, mode = "incremental" } = await req.json();
    if (!team_id) throw new Error("team_id required");

    // Create job row
    const { data: job, error: jobErr } = await sb
      .from("reclassification_jobs")
      .insert({ team_id, status: "pending", mode })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const jobId = job.id;

    // Return job_id immediately, then process in background
    const responseBody = JSON.stringify({ job_id: jobId });

    // Use waitUntil-style: start background work after responding
    // Deno edge functions support this via EdgeRuntime.waitUntil or just async work
    // We'll use a different approach: respond first, then process
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    writer.write(encoder.encode(responseBody));
    writer.close();

    // Start background processing (non-blocking)
    processInBackground(sb, jobId, team_id, mode).catch((err) => {
      console.error("Background processing failed:", err);
    });

    return new Response(stream.readable, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reclassify-contributions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processInBackground(
  sb: ReturnType<typeof createClient>,
  jobId: string,
  teamId: string,
  mode: string,
) {
  try {
    // Update status to running
    await sb.from("reclassification_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const since = fourteenDaysAgo.toISOString();

    // Fetch external_activity with pagination
    const extData: any[] = [];
    let extFrom = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await sb
        .from("external_activity")
        .select("id, source, activity_type, title, member_id, metadata")
        .eq("team_id", teamId)
        .gte("occurred_at", since)
        .range(extFrom, extFrom + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      extData.push(...rows);
      if (rows.length < PAGE) break;
      extFrom += PAGE;
    }

    // Fetch commitments
    const { data: commitData } = await sb
      .from("commitments")
      .select("id, title, description, member_id")
      .eq("team_id", teamId)
      .gte("created_at", since);

    // Build items
    const items: any[] = [];
    for (const e of extData) {
      items.push({
        id: e.id,
        source_type: "external_activity",
        source: e.source,
        activity_type: e.activity_type,
        title: e.title,
        member_id: e.member_id,
        metadata: e.metadata,
      });
    }
    for (const c of commitData || []) {
      items.push({
        id: c.id,
        source_type: "commitment",
        title: c.title,
        description: c.description || undefined,
        member_id: c.member_id,
      });
    }

    let itemsToProcess = items;

    if (mode === "incremental") {
      // Filter out already-classified
      const allIds = items.map((it) => it.id);
      const classifiedIds = new Set<string>();
      for (let i = 0; i < allIds.length; i += 500) {
        const chunk = allIds.slice(i, i + 500);
        const { data: existing } = await sb
          .from("impact_classifications")
          .select("activity_id")
          .eq("team_id", teamId)
          .in("activity_id", chunk);
        for (const c of (existing || []) as any[]) {
          classifiedIds.add(c.activity_id);
        }
      }
      itemsToProcess = items.filter((it) => !classifiedIds.has(it.id));
    }

    // Update total
    await sb.from("reclassification_jobs").update({
      total: itemsToProcess.length,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    if (itemsToProcess.length === 0) {
      await sb.from("reclassification_jobs").update({
        status: "complete",
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }

    // Process in batches of 20 by calling ai-classify-contributions internally
    let totalClassified = 0;
    let totalProcessed = 0;

    for (let i = 0; i < itemsToProcess.length; i += 20) {
      const batch = itemsToProcess.slice(i, i + 20);

      try {
        const { data, error } = await sb.functions.invoke("ai-classify-contributions", {
          body: { team_id: teamId, items: batch },
        });

        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402 || status === 429) {
            // Graceful degradation — mark complete with what we have
            await sb.from("reclassification_jobs").update({
              status: "complete",
              error_message: status === 402
                ? "AI credits exhausted. Partial classification saved."
                : "AI rate limit reached. Partial classification saved.",
              processed: totalProcessed + batch.length,
              classified: totalClassified,
              updated_at: new Date().toISOString(),
            }).eq("id", jobId);
            return;
          }
          console.error("Batch error:", error);
          // Continue with next batch on non-fatal errors
        }

        if (data?.degraded?.reason === "credits_exhausted" || data?.degraded?.reason === "rate_limited") {
          await sb.from("reclassification_jobs").update({
            status: "complete",
            error_message: data.degraded.message || "AI quota reached. Partial results saved.",
            processed: totalProcessed + batch.length,
            classified: totalClassified + (Number(data?.classified) || 0),
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
          return;
        }

        totalClassified += Number(data?.classified || 0);
      } catch (batchErr) {
        console.error("Batch exception:", batchErr);
      }

      totalProcessed += batch.length;

      // Update progress
      await sb.from("reclassification_jobs").update({
        processed: totalProcessed,
        classified: totalClassified,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }

    await sb.from("reclassification_jobs").update({
      status: "complete",
      processed: totalProcessed,
      classified: totalClassified,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);

    console.log(`Reclassification job ${jobId} complete: ${totalClassified}/${totalProcessed} classified`);
  } catch (err) {
    console.error("Reclassification job failed:", err);
    await sb.from("reclassification_jobs").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : "Unknown error",
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).catch(() => {});
  }
}
