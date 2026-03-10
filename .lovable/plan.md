

## Fix: GitHub Sync Uses Unreliable Single-Date Format

### Root Cause

`github-sync-activity` queries with `committer-date:${today}` (e.g. `committer-date:2026-03-10`) — a single date string. The GitHub Search API is unreliable with single-date filters and often returns 0 results even when commits exist.

Meanwhile, `github-fetch-activity` uses a **range** format (`committer-date:${start}..${end}`) and successfully finds Joachim's commits. The fix is to align the sync function with the same range format.

### Changes

**`supabase/functions/github-sync-activity/index.ts`:**
1. Parse optional `days_back` from request body (default: `1`)
2. Compute `startDate` and `endDate` as date strings
3. Replace all single-date queries with range format:
   - Commits: `committer-date:${startDate}..${endDate}` (for both author and committer searches)
   - PRs opened: `created:${startDate}..${endDate}`
   - PRs merged: `merged:${startDate}..${endDate}`

**`src/components/settings/SyncNowCard.tsx`:**
- Pass `{ days_back: 30 }` in the body when manually syncing GitHub, to backfill the last 30 days

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Accept `days_back`, use date range format instead of single date |
| `src/components/settings/SyncNowCard.tsx` | Pass `days_back: 30` for manual GitHub sync |

