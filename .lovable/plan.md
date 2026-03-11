

## Full Diagnosis

There are **three distinct bugs** causing missing activity for ClickUpBotGOAT (Joachim):

### Bug 1: Events API 403/404 — Fundamentally Broken for Multi-User
The logs confirm:
- `Events API returned 403 for ClickUpBotGOAT`
- `Events API returned 404 for mattisaa, stiangrim, andersliland, ...`

The endpoint `GET /users/{username}/events/orgs/{org}` only works when the **authenticated user requests their own events**. A single PAT from one user cannot read another user's org events. The 403 means the PAT lacks "Events" org permission; the 404 means it's trying to read a different user's events entirely. This approach is dead — it will never work with a shared PAT.

### Bug 2: Per-Repo Commits Fallback Matches Nobody
`fetchCommitsPerRepo` correctly removes `?author=` and filters client-side, but for Lovable merge commits:
- `author.login` = `lovable-dev[bot]`
- `committer.login` = `web-flow` (GitHub's merge bot)
- `commit.author.name` = `lovable-dev[bot]`
- `commit.committer.name` = `GitHub`

`ClickUpBotGOAT` appears in **none** of these fields. The user who clicks "Merge" on a PR is only recorded in the PR's `merged_by` field, not in commit metadata.

### Bug 3: PR Attribution Only Checks Author, Not Merger
Both the Search API query (`author:${username}+type:pr+merged:...`) and the per-repo fallback (`pr.user?.login`) only look at who **opened** the PR. For Lovable PRs, the opener is `lovable-dev[bot]`. Joachim is the **merger** — recorded in `pr.merged_by.login` — which is never checked.

### Why Activity Decreased
The previous iteration may have also introduced a regression — the `dateRange` calculation in `github-sync-activity` line 228-229 uses `daysBack - 1` which for `daysBack=1` results in `startDate === endDate === today`. Combined with the Events API returning errors for every user, the net effect is fewer results than before.

---

## Fix Plan

### Approach: Test-First with Isolated Logic

Extract the filtering/matching logic into pure functions that can be unit-tested, then fix them.

### Step 1: Write Deno Tests

Create `supabase/functions/github-sync-activity/index.test.ts` that:
- Mocks GitHub API responses matching the Lovable scenario (author=`lovable-dev[bot]`, committer=`web-flow`, merger=`ClickUpBotGOAT`)
- Tests that `ClickUpBotGOAT` is correctly attributed commits and PRs
- Tests that the Events API failure doesn't break the sync
- Tests the date range calculation

### Step 2: Fix PR Attribution (Primary Fix)

In both `github-sync-activity` and `github-fetch-activity`:
1. **`fetchPRsPerRepo`**: Also match PRs where `pr.merged_by?.login` matches the username (not just `pr.user?.login`). This captures PRs that Joachim merged but didn't author.
2. **Search API PR queries**: Add a second query `is:pr is:merged merged:${dateRange}` scoped to org repos, checking `merged_by` in the response.

### Step 3: Attribute Merged PR Commits to Merger

For each PR merged by the user, fetch the PR's commits and upsert them as the user's commit activity. This way, when Joachim merges a Lovable PR with 5 commits, those 5 commits appear under his name.

### Step 4: Remove Broken Events API

Remove `fetchUserEvents` entirely — it can never work with a single PAT for multiple users. Replace it with the `merged_by` approach which uses standard repo-level APIs that the PAT can access.

### Step 5: Fix Date Range Edge Case

Line 228: `new Date(Date.now() - (daysBack - 1) * 86400000)` — for `daysBack=1`, this computes `Date.now()` which is today. Should use `daysBack * 86400000` to go back the full number of days.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.test.ts` | New — Deno tests reproducing the bug with mock data |
| `supabase/functions/github-sync-activity/index.ts` | Fix PR attribution (`merged_by`), add merged-PR commit attribution, remove broken Events API, fix date range |
| `supabase/functions/github-fetch-activity/index.ts` | Same fixes for the analytics-facing function |

