
Diagnosis from current data:
- Joachim is being mapped and synced: `github_user_mappings` has Joachim (`user_id=8c790...`) mapped to `github_username=Jokkos1337` and `github_user_id=164879107`.
- Activity exists in DB for Joachim very recently (latest at `2026-03-13 13:22:21+00`, e.g. commit `fdc9fa0`).
- Cron is active and firing every 30 min.
- The real gaps are likely:
  1) `github-sync-activity` can stop early due its 120s time budget and returns `has_more`, but cron does not continue pagination (tail users can be skipped in a cycle).
  2) Dashboard/Activity do not auto-refresh while open (and global `refetchOnWindowFocus` is off), so UI can look stale.
  3) Matching is still mostly username-first; numeric GitHub ID is only partially used.

Implementation plan (no breaking changes):
1) Make cron sync completion-safe
- Update `supabase/functions/github-sync-activity/index.ts` so cron-triggered runs automatically continue with `next_offset` until all users are processed (bounded recursion/loop guard).
- Keep existing manual pagination behavior for Settings “Sync now”.

2) Make identity matching ID-first
- In commit/PR filters, match by `github_user_id` (`author.id`, `committer.id`, `pr.user.id`, `merged_by.id`) before username.
- Keep username checks as fallback.
- If GitHub login changed, update `github_user_mappings.github_username` during sync.

3) Make Activity UI self-refreshing
- `src/hooks/useRecentActivity.ts`: add `refetchInterval` (e.g. 60s), enable `refetchOnWindowFocus` for this query.
- `src/pages/Activity.tsx` activity feed query: same refresh behavior.
- Add lightweight “Last updated” + manual refresh action in Dashboard Activity section for transparency.

4) Sync UX after manual trigger
- `src/components/settings/SyncNowCard.tsx`: invalidate `recent-activity` / `activity-feed` queries after successful sync so UI updates immediately.

Files to update:
- `supabase/functions/github-sync-activity/index.ts`
- `src/hooks/useRecentActivity.ts`
- `src/pages/Activity.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/settings/SyncNowCard.tsx`

Validation checklist:
- Confirm all mapped users are processed each cron cycle (not just first N users).
- Create a new Joachim commit, then verify it appears in DB after sync and in UI without page reload.
- Verify username-rename scenario still attributes activity correctly via numeric GitHub ID.
