
Goal: make activity sync trustworthy so we do not miss Joachim/Anders (or anyone) again.

What I verified now (root causes)
1) Sync freshness gap is real right now:
- DB time is `2026-03-13 14:09 UTC`.
- Latest GitHub activity row is `13:22 UTC`.
- SHAs from your screenshots like `5b6fac4`, `ba87c3a`, `11e4ee4` are not in `external_activity` yet.

2) Cron transition created a temporary hole:
- Old GitHub cron job (`jobid 3`) ran up to 14:00 with old command.
- New job (`jobid 7`) exists but has not executed yet (no run records yet).

3) Visibility limits in UI can hide members:
- Activity page hard-limits external rows to 200.
- Dashboard hard-limits external rows to 30 and then slices to 25 total.
- Team has ~1710 external rows in 30d, so users can be “missing” from UI even when data exists.

4) Data model can overwrite cross-member attribution:
- `external_activity` unique index is `(external_id, activity_type, source)`.
- Upserts in GitHub/ClickUp use same conflict key.
- This can overwrite per-member entries when same external event should count for multiple members/teams.

Implementation plan (fix once and for all)
A) Cron reliability + immediate catch-up
- Add migration to:
  - ensure GitHub cron command uses `{"is_cron": true}` + `timeout_milliseconds := 120000`
  - set ClickUp cron to explicit longer timeout too (same 120000)
- Add one-time catch-up SQL in migration (or dedicated run migration) to trigger:
  - `github-sync-activity` immediately with `is_cron=true` and a short backfill window
  - `clickup-sync-activity` immediately
- Validate by checking `cron.job_run_details` + latest `external_activity.occurred_at`.

B) Correct dedupe key so “everyone’s activity” is preserved
- DB migration:
  - drop old unique index on `(external_id, activity_type, source)`
  - create new unique index on `(team_id, member_id, external_id, activity_type, source)`
- Update upsert conflict target in:
  - `supabase/functions/github-sync-activity/index.ts`
  - `supabase/functions/clickup-sync-activity/index.ts`
- Run backfill sync after deploy to repopulate potentially overwritten history.

C) Harden GitHub sync completeness
- In `github-sync-activity`:
  - keep cron continuation (`is_cron`) and add explicit continuation logging with processed/total
  - increase request resilience (slightly longer per-request timeout and retry once on transient failures)
  - persist per-user sync status (latest synced timestamp/count/error) for auditability.

D) Fix UI so missing users are visible
- `src/pages/Activity.tsx`:
  - replace fixed `.limit(200)` with paginated loading (or cursor-style “Load more”)
- `src/hooks/useRecentActivity.ts` / Dashboard section:
  - replace fixed `.limit(30)` + slice behavior with balanced feed logic (cap per member before global merge) so one high-volume user does not crowd out others.
- Add “Last synced” indicator (GitHub/ClickUp) in dashboard/activity for transparency.

Technical details
Files to change:
- `supabase/migrations/*` (new migration for cron + unique index + optional sync audit table)
- `supabase/functions/github-sync-activity/index.ts`
- `supabase/functions/clickup-sync-activity/index.ts`
- `src/pages/Activity.tsx`
- `src/hooks/useRecentActivity.ts`
- `src/pages/Dashboard.tsx`

Validation checklist (must pass)
1) Latest screenshot SHAs appear after immediate catch-up sync.
2) Per-member freshness query shows recent updates for Joachim + Anders.
3) Activity UI shows both users without manual refresh tricks.
4) Cron run history shows steady successful runs with no stale gap.
