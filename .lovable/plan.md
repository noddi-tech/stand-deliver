

# Fix: Reclassification Job Stops Mid-Way

## Problem

The job stopped at 320/1985. The `processInBackground()` call is a fire-and-forget promise that runs *after* the HTTP response is returned. Supabase Edge Functions (Deno) terminate the isolate shortly after the response is sent — the "background" processing gets killed silently.

This is a fundamental limitation: **Supabase Edge Functions cannot do true background processing after returning a response.**

## Solution: Self-Chaining Edge Function

Instead of fire-and-forget, the edge function should process a time-boxed chunk (e.g. ~60 seconds worth of batches), then **re-invoke itself** for the next chunk. Each invocation is a fresh HTTP request with its own time budget.

### How It Works

```text
Client → reclassify-contributions (chunk 1: items 0-400)
           ↓ updates job row
           ↓ re-invokes itself with offset=400
         reclassify-contributions (chunk 2: items 400-800)
           ↓ updates job row
           ↓ re-invokes itself with offset=800
         ... until all items processed
```

### Changes

**`supabase/functions/reclassify-contributions/index.ts`** — Rewrite to:

1. Accept optional `job_id` and `offset` params (for continuation calls)
2. On first call: fetch items, compute total, create job row, start processing from offset 0
3. Process batches in a loop with a **time guard** (~50 seconds). After each batch of 20, check elapsed time.
4. When time budget is nearly exhausted, **self-invoke** with the current offset and job_id, then return.
5. On continuation call: load the job row, skip item-fetching (pass items via job context or re-fetch), continue from offset.
6. Mark job `complete` only when offset >= total.

Since items can't be passed between invocations efficiently (1985 items is too large for a request body), each invocation will re-fetch items but skip to the correct offset. The `filterUnclassified` step only runs on the first call; continuation calls use `mode` + offset.

**Also fix the stuck job**: Add a cleanup step — on first call, if there's already a `running` job for this team, mark it as `failed` (stale) before creating a new one.

**`src/hooks/useTeamFocus.ts`** — No changes needed (Realtime subscription already handles incremental updates).

### Technical Details

- Time budget per invocation: ~50 seconds (leaves margin before Supabase's ~150s wall clock limit)
- Batch size stays at 20 items per AI call
- Self-invocation uses `sb.functions.invoke("reclassify-contributions", ...)` with service role
- Each chunk processes ~250-400 items (depending on AI response times)
- Job row gets updated after every batch, so UI progress stays live

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/reclassify-contributions/index.ts` | Rewrite with self-chaining + time guard |

