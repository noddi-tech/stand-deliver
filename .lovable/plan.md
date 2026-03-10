

## Bug: Joachim's GitHub Commits Not Showing in Activity

### Root Cause

Joachim's GitHub username is `ClickUpBotGOAT`. His commits in the repo are authored by `lovable-dev[bot]` with `ClickUpBotGOAT` as the **committer** (shown in GitHub as "lovable-dev[bot] and ClickUpBotGOAT committed"). 

The `github-sync-activity` function searches using `author:ClickUpBotGOAT`, but GitHub's search API `author:` filter matches the **commit author** — which is `lovable-dev[bot]`, not `ClickUpBotGOAT`. So the search returns 0 results for Joachim.

Database confirms: Joachim has **0 GitHub entries** in `external_activity`, while 5 other team members have 130 entries combined.

### Fix

**In `github-sync-activity/index.ts`:** Run a second commit search using `committer:${username}` as a fallback, deduplicating by SHA. This captures commits where the user is the committer (e.g., Lovable bot commits co-authored by the user).

```typescript
// Existing: author search
const commitsRes = await fetch(
  `${GH_API}/search/commits?q=author:${username}+committer-date:${today}...`
);

// NEW: committer search (catches Lovable bot commits)
const committerRes = await fetch(
  `${GH_API}/search/commits?q=committer:${username}+committer-date:${today}...`
);
// Merge results, deduplicate by SHA
```

Same pattern for PRs is fine — PRs use `author:` on issues which matches the GitHub user who opened them, so that works correctly.

**Backfill:** After deploying, manually invoke the sync to capture today's commits. Historical commits before today won't be captured since the sync only looks at `committer-date:${today}`. We could do a one-time backfill by running the sync with a wider date range, or accept that historical data will build up going forward.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Add `committer:` fallback search, merge + deduplicate results |

