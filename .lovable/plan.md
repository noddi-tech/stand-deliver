

## Bug Fix Plan: Activity Feed Issues

### Bugs Found

**Bug 1: Tom Arne's `__none__` username polluting GitHub data**
Tom Arne is mapped with `github_username: '__none__'` (meaning "No GitHub account"). The `github-sync-activity` function doesn't skip this sentinel value, so it queries GitHub's search API with `author:__none__` — which returns random public commits from strangers. Tom Arne now has 176 bogus activity rows (out of 258 total). This is why only his commits appear in the feed — they dominate the 25-item limit.

**Bug 2: Standup responses not showing in activity feed**
The `useRecentActivity` hook uses `.eq("session.team_id", teamId!)` to filter standup responses via a nested relation. This PostgREST nested filter pattern on an `!inner` join doesn't work as a WHERE clause — it silently returns no rows. There ARE standup responses (4 from yesterday), but the query never finds them.

**Bug 3: No ClickUp activity in feed**
The database has 0 ClickUp rows. The ClickUp sync function exists but likely hasn't run (no cron trigger was set up for it, or no tasks matched the status filters). The `clickup-sync-activity` only captures tasks with status "complete/done/closed" or "in progress/in review/working" — any other status is skipped. This is probably too restrictive.

### Fixes

**Fix 1: Skip `__none__` in GitHub sync + clean up bad data**

In `github-sync-activity/index.ts`, add a check after line 66:
```typescript
if (username === '__none__') continue;
```

Migration to delete Tom Arne's bogus data:
```sql
DELETE FROM external_activity WHERE member_id = '47249d29-92e7-445f-b43a-4d022d0f8c59' AND source = 'github';
```

**Fix 2: Fix standup responses query in `useRecentActivity.ts`**

Replace the nested `.eq("session.team_id", teamId!)` filter with a proper approach — first fetch today's session IDs for the team, then query responses by those session IDs. Or simpler: use a two-step query or just query all responses where the member belongs to the team.

Revised approach — join through `team_members` instead of `standup_sessions`:
```typescript
supabase
  .from("standup_responses")
  .select("id, member_id, submitted_at, mood, session:standup_sessions!inner(team_id), member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url))")
  .eq("member.team_id", teamId!)
  .gte("submitted_at", sevenDaysAgo)
  .order("submitted_at", { ascending: false })
  .limit(20)
```

Actually, the most reliable approach: query `standup_sessions` for the team first, then query responses by session IDs. But that's two round trips. Instead, filter via `team_members` relation which is more reliable than filtering through `standup_sessions`.

**Fix 3: ClickUp sync — broaden status filter + add all task changes**

The current ClickUp sync only captures "complete/done/closed" and "in progress" statuses, skipping everything else. Broaden to capture any task that was updated today (since the API already filters by `date_updated_gt`), recording the current status as the activity type. This ensures all ClickUp task updates show up.

Also ensure the `github-fetch-activity` function (used for weekly digests) also skips `__none__`.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Skip `__none__` usernames |
| `supabase/functions/github-fetch-activity/index.ts` | Skip `__none__` usernames |
| `src/hooks/useRecentActivity.ts` | Fix standup response query to use team_members join |
| `supabase/functions/clickup-sync-activity/index.ts` | Broaden status filter to capture all updated tasks |
| Migration | Delete bogus Tom Arne external_activity rows |

