

## Root Cause Found

**The GitHub List Pull Requests endpoint (`GET /repos/{owner}/{repo}/pulls?state=closed`) does NOT return `merged_by` in its response.** This field is only available on the single PR detail endpoint (`GET /repos/{owner}/{repo}/pulls/{number}`).

This means `fetchMergedPRCommits` and `fetchPRsPerRepo` both filter on `pr.merged_by?.login` which is always `null` from the list endpoint. The filter never matches. Zero results.

This is confirmed by:
- GitHub's own issue tracker: [rest-api-description#3162](https://github.com/github/rest-api-description/issues/3162) explicitly documents this as a known limitation
- Edge function logs: `fetchMergedPRCommits: found 0 commits from PRs merged by ClickUpBotGOAT` — the function runs but the filter matches nothing

The existing unit tests pass because they test `isPRByUser` with mock data that has `merged_by` populated. The tests don't reflect reality.

## Fix

For each repo, after listing closed PRs (which gives us `merged_at` but not `merged_by`), fetch the **individual PR detail** for each merged PR within the date range to get `merged_by`.

### Step 1: Add a failing test that reproduces the bug

Add a test that simulates the real GitHub API response shape — where list endpoint PRs have `merged_by: null`:

```typescript
Deno.test("BUG: List endpoint PRs have merged_by=null, must fetch detail", () => {
  // This is what the list endpoint actually returns
  const listPR = {
    number: 42,
    merged_at: "2026-03-10T12:00:00Z",
    user: { login: "lovable-dev[bot]" },
    merged_by: null,  // <-- THIS is the bug: list endpoint never populates this
  };
  // isPRByUser fails because merged_by is null
  assertEquals(isPRByUser(listPR, "ClickUpBotGOAT"), false);
  // This proves we CANNOT rely on merged_by from list endpoint
});
```

### Step 2: Fix `fetchMergedPRCommits` in both functions

For each merged PR in the date range, fetch `GET /repos/{repo}/pulls/{number}` to get the actual `merged_by` field:

```typescript
// In fetchMergedPRCommits, after getting the list:
const mergedPRs = prs.filter(pr => pr.merged_at && isInDateRange(pr));

// Fetch individual PR details to get merged_by (batch to limit requests)
for (const pr of mergedPRs) {
  const detailRes = await fetchWithTimeout(
    `${GH_API}/repos/${repoFullName}/pulls/${pr.number}`,
    { headers: GH_HEADERS(token) }
  );
  if (!detailRes.ok) continue;
  const detail = await detailRes.json();
  
  const isMerger = detail.merged_by?.login?.toLowerCase() === userLower;
  const isAuthor = detail.user?.login?.toLowerCase() === userLower;
  if (isMerger && !isAuthor) {
    // Fetch this PR's commits and attribute to merger
  }
}
```

### Step 3: Same fix for `fetchPRsPerRepo`

The merged PR attribution in `fetchPRsPerRepo` also checks `merged_by` from the list response. Apply the same individual-fetch pattern there.

### Optimization

To avoid excessive API calls, limit individual PR detail fetches:
- Only fetch details for PRs within the date range (already filtered by `merged_at`)
- Process in batches of 5 with `Promise.allSettled`
- Skip repos with no merged PRs in range

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.test.ts` | Add test proving `merged_by` is null from list endpoint; add test for the detail-fetch flow |
| `supabase/functions/github-sync-activity/index.ts` | Fix `fetchMergedPRCommits` and `fetchPRsPerRepo` to fetch individual PR details for `merged_by` |
| `supabase/functions/github-fetch-activity/index.ts` | Same fixes |

