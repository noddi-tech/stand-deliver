

## Problem: `ClickUpBotGOAT` Is Never Author or Committer

The per-repo fallback filters commits by matching `author.login`, `committer.login`, `commit.author.name`, and `commit.committer.name` against `ClickUpBotGOAT`. But for Lovable-authored commits:

- **author**: `lovable-dev[bot]`
- **committer**: `GitHub` (web-flow, for merge commits)

`ClickUpBotGOAT` doesn't appear in any of these four fields. Joachim's role is that he **merges the PR** — he's not recorded as the commit author or committer. The client-side filter will never match.

The screenshot confirms: only 1 commit in 30 days (likely a manual one), while Joachim has been actively merging Lovable PRs across multiple repos.

## Fix: Add GitHub Events API as a Third Data Source

The **GitHub Events API** (`GET /users/{username}/events`) reliably returns all actions a user performs, including `PushEvent` (pushes/merges) and `PullRequestEvent` (opening/merging PRs). This doesn't depend on search indexing or author/committer fields.

### Approach

After the Search API + per-repo fallback (for users where those work), add a third source:

1. Fetch `GET /users/{username}/events?per_page=100` (public events, no auth issues)
2. Filter for `PushEvent` events within the date range
3. Extract commit SHAs from `payload.commits[]` — these are the commits the user pushed/merged
4. Deduplicate against already-found commits (by SHA)
5. Upsert any new ones as `commit` activity

This captures Lovable merges because when Joachim merges a PR, GitHub records a `PushEvent` under his username with all the commits from that PR.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Add `fetchUserEvents()` function; call it after existing commit logic to capture push/merge events; deduplicate by SHA |
| `supabase/functions/github-fetch-activity/index.ts` | Same events API fallback |

### Key code:

```typescript
async function fetchUserEvents(token: string, username: string, startDate: string, endDate: string): Promise<any[]> {
  const commits: any[] = [];
  const res = await fetchWithTimeout(
    `${GH_API}/users/${username}/events?per_page=100`,
    { headers: GH_HEADERS(token) }
  );
  if (!res.ok) return [];
  const events = await res.json();
  for (const event of events) {
    if (event.type !== "PushEvent") continue;
    const eventDate = event.created_at?.split("T")[0];
    if (eventDate < startDate || eventDate > endDate) continue;
    const repo = event.repo?.name || "";
    for (const c of event.payload?.commits || []) {
      commits.push({
        sha: c.sha,
        html_url: `https://github.com/${repo}/commit/${c.sha}`,
        commit: { message: c.message, author: { date: event.created_at } },
        repository: { full_name: repo },
      });
    }
  }
  return commits;
}
```

Then after the existing commit-gathering code, merge in events:

```typescript
// After Search API + per-repo fallback
const eventCommits = await fetchUserEvents(token, username, startDate, endDate);
for (const c of eventCommits) {
  if (!seenShas.has(c.sha)) {
    seenShas.add(c.sha);
    allCommits.push(c);
  }
}
```

This is additive — it won't break existing users, only adds missing commits for users like Joachim whose activity comes through merges.

