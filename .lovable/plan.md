

## Root Cause: `?author=` Doesn't Match Committers

The per-repo fallback queries `/repos/{owner}/{repo}/commits?author=ClickUpBotGOAT`. The GitHub Commits API `author` parameter matches against the **git author** (name/email/login), not the **committer**.

Joachim's commits on repos like `stand-deliver` are made through Lovable, meaning:
- **Author**: `lovable-dev[bot]` (the bot that writes the code)
- **Committer**: `ClickUpBotGOAT` (Joachim, who approves/merges)

So `?author=ClickUpBotGOAT` returns 0 results because he's the committer, not the author. The GitHub Commits API has **no `?committer=` filter parameter**.

This also explains why the Search API (`/search/commits?q=committer:ClickUpBotGOAT`) returns 0 — GitHub's search indexer doesn't index bot-committed content reliably.

## Fix: Query Without Author Filter, Match Client-Side

For the per-repo fallback, fetch recent commits from each repo **without** the `?author=` filter, then check both `author.login` and `committer.login` client-side.

To keep this performant:
1. **Parallelize** repo fetches in batches of 10 with `Promise.allSettled`
2. **Add per-request timeout** (5s) via `AbortController`
3. **Limit scope**: only fetch commits in the date range (`?since=` and `?until=` still work without `?author=`)
4. **Match both author AND committer** login against the username

### Changes

**`supabase/functions/github-sync-activity/index.ts`**:
- `fetchCommitsPerRepo`: Remove `?author=${username}`, fetch all commits in date range, then filter where `commit.author.name`, `author.login`, or `committer.login` matches the username (case-insensitive)
- Parallelize with `Promise.allSettled` in batches of 10
- Add 5s `AbortController` timeout per request

**`supabase/functions/github-fetch-activity/index.ts`**:
- Same changes to `fetchCommitsPerRepo`

### Key code change:

```typescript
// Before (misses committer-only commits):
`/repos/${repo}/commits?author=${username}&since=...`

// After (catches both author and committer):
`/repos/${repo}/commits?since=${since}T00:00:00Z&until=${until}T23:59:59Z&per_page=100`
// Then filter client-side:
const isMatch = (c) =>
  c.author?.login?.toLowerCase() === username.toLowerCase() ||
  c.committer?.login?.toLowerCase() === username.toLowerCase();
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Remove `?author=` from fallback, match author+committer client-side, parallelize with batches of 10 + 5s timeout |
| `supabase/functions/github-fetch-activity/index.ts` | Same fix |

