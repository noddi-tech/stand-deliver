
Do I know what the issue is? Yes.

### Why badges are not showing
1. The badge logic itself works (`detect-badges` can award badges correctly).
2. The problem is the trigger path: badges are awarded only after sync functions finish.
3. Your cron jobs call `github-sync-activity` and `clickup-sync-activity` through `net.http_post`, which is currently hitting the default ~5s timeout frequently.
4. When those sync requests time out, badge detection at the end of sync often never runs.
5. Also, if badges are inserted after Analytics has already loaded, the current badge query may not refresh immediately on-screen.

### Implementation plan

#### 1) Make cron invocations reliable (primary fix)
- Add a new migration to re-create cron jobs with explicit longer `timeout_milliseconds` (e.g. 120000–180000) for:
  - `sync-github-activity`
  - `sync-clickup-activity`
  - `daily-standup-summary` (for consistency)
- Make the migration idempotent by unscheduling existing jobs first, then scheduling again.

#### 2) Decouple badge awarding from long sync runtime
- Add a lightweight edge function `badge-detection-cron` that:
  - fetches active teams
  - invokes `detect-badges` per team
  - returns per-team award counts
- Schedule this function via cron (e.g. every 30 minutes).
- This guarantees badge evaluation even if sync jobs are slow or partially fail.

#### 3) Improve observability + resiliency in sync functions
- In:
  - `supabase/functions/github-sync-activity/index.ts`
  - `supabase/functions/clickup-sync-activity/index.ts`
- Harden `detect-badges` invocation handling:
  - check `response.ok`
  - log status/body on failure
  - return badge trigger summary in function response payload for easier debugging.

#### 4) Make badge UI update faster
- Update `useTeamBadges` in `src/hooks/useBadges.ts`:
  - add periodic refresh (`refetchInterval`) and keep `refetchOnWindowFocus`
- So badges appear without requiring manual hard reload after backend awards.

### Technical details (files)
- `supabase/migrations/<new>.sql` (cron timeout + reschedule + badge cron schedule)
- `supabase/functions/badge-detection-cron/index.ts` (new)
- `supabase/config.toml` (register new function, `verify_jwt = false`)
- `supabase/functions/github-sync-activity/index.ts` (response/error handling around badge trigger)
- `supabase/functions/clickup-sync-activity/index.ts` (same)
- `src/hooks/useBadges.ts` (query refresh behavior)

### Verification plan (end-to-end)
1. Trigger GitHub sync and ClickUp sync manually.
2. Confirm `member_badges` now fills automatically.
3. Open `/analytics`, `/dashboard`, and `/team-feed` and verify badge emojis render for members (including Syver/Anders).
4. Check cron/network logs to confirm no more repeated 5s timeout pattern for sync jobs.
