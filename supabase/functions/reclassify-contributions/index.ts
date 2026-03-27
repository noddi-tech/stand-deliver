import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIME_BUDGET_MS = 50_000; // 50 seconds per invocation
const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const { team_id, mode = "incremental", job_id, offset = 0 } = await req.json();
    if (!team_id) throw new Error("team_id required");

    const startTime = Date.now();

    // --- CONTINUATION CALL ---
    if (job_id && offset > 0) {
      return await processContinuation(sb, team_id, job_id, mode, offset, startTime);
    }

    // --- INITIAL CALL ---

    // Mark any stale running jobs as failed
    await sb
      .from("reclassification_jobs")
      .update({ status: "failed", error_message: "Superseded by new job", updated_at: new Date().toISOString() })
      .eq("team_id", team_id)
      .in("status", ["pending", "running"]);

    // Fetch and filter items
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const since = fourteenDaysAgo.toISOString();

    const items = await fetchItems(sb, team_id, since);
    let itemsToProcess = items;

    if (mode === "incremental") {
      itemsToProcess = await filterUnclassified(sb, items, team_id);
    }

    // Create job row with correct total
    const { data: job, error: jobErr } = await sb
      .from("reclassification_jobs")
      .insert({ team_id, status: "running", mode, total: itemsToProcess.length })
      .select("id")
      .single();
    if (jobErr) throw jobErr;
    const newJobId = job.id;

    if (itemsToProcess.length === 0) {
      await sb.from("reclassification_jobs").update({
        status: "complete",
        updated_at: new Date().toISOString(),
      }).eq("id", newJobId);

      return jsonResponse({ job_id: newJobId });
    }

    // Process first chunk synchronously
    const result = await processChunk(sb, newJobId, team_id, itemsToProcess, 0, startTime);

    // If more items remain, self-invoke for the next chunk
    if (result.nextOffset < itemsToProcess.length) {
      selfInvoke(sb, team_id, mode, newJobId, result.nextOffset).catch((err) => {
        console.error("Self-invoke failed:", err);
      });
    } else {
      // All done
      await sb.from("reclassification_jobs").update({
        status: "complete",
        processed: result.totalProcessed,
        classified: result.totalClassified,
        updated_at: new Date().toISOString(),
      }).eq("id", newJobId);
      console.log(`Reclassification job ${newJobId} complete: ${result.totalClassified}/${result.totalProcessed}`);
    }

    return jsonResponse({ job_id: newJobId });
  } catch (e) {
    console.error("reclassify-contributions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processContinuation(
  sb: ReturnType<typeof createClient>,
  teamId: string,
  jobId: string,
  mode: string,
  offset: number,
  startTime: number,
) {
  // Re-fetch items (we can't pass 2000 items between invocations)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const since = fourteenDaysAgo.toISOString();

  const items = await fetchItems(sb, teamId, since);
  let itemsToProcess = items;

  if (mode === "incremental") {
    itemsToProcess = await filterUnclassified(sb, items, teamId);
  }

  // Verify job still exists and is running
  const { data: jobRow } = await sb
    .from("reclassification_jobs")
    .select("status, total")
    .eq("id", jobId)
    .single();

  if (!jobRow || jobRow.status !== "running") {
    console.log(`Job ${jobId} no longer running (status: ${jobRow?.status}), stopping.`);
    return jsonResponse({ job_id: jobId, stopped: true });
  }

  // Update total if it changed (e.g. incremental mode items changed between invocations)
  if (itemsToProcess.length !== jobRow.total) {
    await sb.from("reclassification_jobs").update({
      total: itemsToProcess.length,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  if (offset >= itemsToProcess.length) {
    await sb.from("reclassification_jobs").update({
      status: "complete",
      processed: itemsToProcess.length,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return jsonResponse({ job_id: jobId });
  }

  const result = await processChunk(sb, jobId, teamId, itemsToProcess, offset, startTime);

  if (result.nextOffset < itemsToProcess.length) {
    selfInvoke(sb, teamId, mode, jobId, result.nextOffset).catch((err) => {
      console.error("Self-invoke failed:", err);
    });
  } else {
    await sb.from("reclassification_jobs").update({
      status: "complete",
      processed: result.totalProcessed,
      classified: result.totalClassified,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    console.log(`Reclassification job ${jobId} complete: ${result.totalClassified}/${result.totalProcessed}`);
  }

  return jsonResponse({ job_id: jobId });
}

async function processChunk(
  sb: ReturnType<typeof createClient>,
  jobId: string,
  teamId: string,
  items: any[],
  startOffset: number,
  startTime: number,
): Promise<{ nextOffset: number; totalProcessed: number; totalClassified: number }> {
  // Load current progress from job row
  const { data: jobRow } = await sb
    .from("reclassification_jobs")
    .select("processed, classified")
    .eq("id", jobId)
    .single();

  let totalProcessed = jobRow?.processed || startOffset;
  let totalClassified = jobRow?.classified || 0;
  let currentOffset = startOffset;

  for (let i = startOffset; i < items.length; i += BATCH_SIZE) {
    // Time guard: stop if we've used most of our budget
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      break;
    }

    const batch = items.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await sb.functions.invoke("ai-classify-contributions", {
        body: { team_id: teamId, items: batch },
      });

      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 402 || status === 429) {
          await sb.from("reclassification_jobs").update({
            status: "complete",
            error_message: status === 402
              ? "AI credits exhausted. Partial classification saved."
              : "AI rate limit reached. Partial classification saved.",
            processed: totalProcessed + batch.length,
            classified: totalClassified,
            updated_at: new Date().toISOString(),
          }).eq("id", jobId);
          return { nextOffset: items.length, totalProcessed: totalProcessed + batch.length, totalClassified };
        }
        console.error("Batch error:", error);
      }

      if (data?.degraded?.reason === "credits_exhausted" || data?.degraded?.reason === "rate_limited") {
        await sb.from("reclassification_jobs").update({
          status: "complete",
          error_message: data.degraded.message || "AI quota reached. Partial results saved.",
          processed: totalProcessed + batch.length,
          classified: totalClassified + (Number(data?.classified) || 0),
          updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        return { nextOffset: items.length, totalProcessed: totalProcessed + batch.length, totalClassified: totalClassified + (Number(data?.classified) || 0) };
      }

      totalClassified += Number(data?.classified || 0);
    } catch (batchErr) {
      console.error("Batch exception:", batchErr);
    }

    totalProcessed += batch.length;
    currentOffset = i + BATCH_SIZE;

    // Update progress after each batch
    await sb.from("reclassification_jobs").update({
      processed: totalProcessed,
      classified: totalClassified,
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  return { nextOffset: currentOffset, totalProcessed, totalClassified };
}

async function selfInvoke(
  sb: ReturnType<typeof createClient>,
  teamId: string,
  mode: string,
  jobId: string,
  offset: number,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  console.log(`Self-invoking reclassify-contributions: job=${jobId} offset=${offset}`);

  // Use fetch directly to avoid circular invoke issues
  const res = await fetch(`${supabaseUrl}/functions/v1/reclassify-contributions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ team_id: teamId, mode, job_id: jobId, offset }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Self-invoke failed (${res.status}): ${text}`);
  }
}

function jsonResponse(data: any) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchItems(
  sb: ReturnType<typeof createClient>,
  teamId: string,
  since: string,
) {
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

  const { data: commitData } = await sb
    .from("commitments")
    .select("id, title, description, member_id")
    .eq("team_id", teamId)
    .gte("created_at", since);

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
  return items;
}

async function filterUnclassified(
  sb: ReturnType<typeof createClient>,
  items: any[],
  teamId: string,
) {
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
  return items.filter((it) => !classifiedIds.has(it.id));
}
