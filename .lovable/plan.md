
Root cause is not a CORS header regression in your function code anymore.  
From Supabase edge analytics, `github-sync-activity` shows:
- `OPTIONS 200` (preflight succeeds)
- `POST 504` at `150112ms` (hard timeout)
- another `POST 200` at `104873ms` (same code can succeed)

So the browser’s “No Access-Control-Allow-Origin” is a timeout symptom from the gateway 504 response, not the primary failure.

Plan to make sync reliable:

1) Scope and chunk GitHub sync requests
- Update `github-sync-activity` to accept `org_id`, `offset`, `limit_users`, `days_back`.
- Filter installations by `org_id` (manual sync from Settings should only process that org).
- Process mapped users in deterministic order and only a chunk per call (`limit_users`, e.g. 2).
- Return progress payload:
  - `processed_users`
  - `total_users`
  - `next_offset`
  - `has_more`
  - per-user `results`

2) Prevent gateway timeout responses
- Add an internal time budget guard in the edge function (stop before platform timeout).
- If budget is near limit, return partial success with `has_more=true` instead of running into 504.

3) Make client continue automatically
- Update `src/components/settings/SyncNowCard.tsx`:
  - Send `org_id` with GitHub sync body.
  - Loop calls while `has_more` is true (offset pagination).
  - Keep button loading state across the whole multi-call sync.
  - Show progress toast (“Synced 2/7 users…”, then success at completion).
- Keep ClickUp behavior unchanged unless we want identical batching there later.

4) Improve error handling UX
- If a chunk call fails, surface actionable error:
  - “Sync timed out mid-run; progress saved. Retry to continue.”
- Preserve partial progress from prior successful chunks.

5) Verification checklist
- Trigger Sync GitHub from Settings on production domain (`standflow.naviosolutions.com`).
- Confirm network calls are multiple short POSTs (no single long 150s call).
- Confirm no browser CORS error toast.
- Confirm edge analytics for `github-sync-activity` are all `POST 200`.
- Confirm `external_activity` contains fresh rows for `Jokkos1337` after run.

Technical details
- Files to change:
  - `supabase/functions/github-sync-activity/index.ts`
  - `src/components/settings/SyncNowCard.tsx`
- No DB schema migration required.
- Existing CORS headers can stay as-is.
- This preserves current GitHub attribution logic (including merged-by PR commit attribution), but makes execution deterministic and timeout-safe.
