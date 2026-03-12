

## Problem

Lovable bot commits list Jokkos1337 as a **co-author** via `Co-authored-by:` trailers in the commit message. The sync function only checks `author.login`, `committer.login`, `commit.author.name`, and `commit.committer.name` -- none of which contain Jokkos1337 for these commits. The Search API's `author:` and `committer:` qualifiers also don't match co-authors.

Result: the per-repo scan never triggers (Search API returns 0, fallback runs, but the filter inside `fetchCommitsPerRepo` also misses co-authors), and the merged-PR-commits path only finds PRs where the user clicked "Merge" -- not direct pushes to main.

## Plan

### 1. Add co-author detection to `fetchCommitsPerRepo` (lines 73-83)

Add a check that parses `commit.message` for `Co-authored-by:` lines containing the username:

```typescript
// Inside the .filter() callback:
const message = c.commit?.message?.toLowerCase() || "";
const isCoAuthor = message.includes(`co-authored-by:`) && 
  message.toLowerCase().includes(userLower);
return (
  authorLogin === userLower ||
  committerLogin === userLower ||
  commitAuthorName === userLower ||
  commitCommitterName === userLower ||
  isCoAuthor
);
```

### 2. Always run per-repo scan for commits (lines 416-426)

Currently the per-repo scan only runs when Search API returns 0 commits. Change it to **always run** (since Search API can never find co-authored commits), merging results with any search hits:

```typescript
// Remove the `if (allCommits.length === 0 && orgName)` guard
// Always fetch per-repo and merge
if (orgName) {
  if (!orgRepos) {
    orgRepos = await fetchOrgRepos(token, orgName);
    orgReposCache[install.org_id] = orgRepos;
  }
  const perRepoCommits = await fetchCommitsPerRepo(token, orgRepos, username, startDate, endDate);
  for (const c of perRepoCommits) {
    if (c.sha && !seenShas.has(c.sha)) {
      seenShas.add(c.sha);
      allCommits.push(c);
    }
  }
}
```

### 3. Fix Activity page server-side filtering (secondary issue, `src/pages/Activity.tsx`)

Move `memberFilter` and `sourceFilter` into the Supabase query so the 200-row limit applies after filtering, not before:

- Pass filters to `useActivityFeed`
- Apply `.eq("member_id", memberFilter)` and `.eq("source", sourceFilter)` on the `external_activity` query
- Apply `.eq("member_id", memberFilter)` on standup responses query
- Skip standup fetch when source is `github` or `clickup`
- Update `queryKey` to include filters

### Files changed
- `supabase/functions/github-sync-activity/index.ts` -- co-author detection + always-run per-repo scan
- `src/pages/Activity.tsx` -- server-side filtering

After deploying, re-run Sync GitHub to populate the co-authored commits.

