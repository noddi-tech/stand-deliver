
Goal: fix remaining GitHub attribution misses for renamed accounts (ClickUpBotGOAT → Jokkos1337) so Lovable co-authored commits are captured reliably.

What I confirmed
- `github-sync-activity` currently checks co-authors with:
  - `message.includes("co-authored-by:") && message.includes(userLower)`
- This fails when commit trailers still contain the old username string.
- Current data supports this gap: Joachim has only 1 GitHub commit in last 90 days, while peers have 100+.
- Activity page filtering is already server-side in `src/pages/Activity.tsx`, so the current blocker is attribution in sync logic.

Implementation plan

1) Add rename-proof identity resolution in `github-sync-activity`
- File: `supabase/functions/github-sync-activity/index.ts`
- Add helper `resolveGitHubUserId(token, username): Promise<number | null>`
  - Calls `GET /users/{username}` with existing GitHub headers.
  - Returns stable numeric GitHub user id (or null on failure).
- Add per-request cache map (username → userId|null) so each user resolves once per sync run.

2) Add robust co-author trailer matcher
- In same file, add helper to parse `Co-authored-by:` lines from commit message.
- Matching rule:
  - Keep existing username checks (author/committer/name + trailer username text).
  - Additionally match numeric noreply pattern when `userId` is known:
    - `<{userId}+...@users.noreply.github.com>`
- This makes matching rename-proof while preserving old behavior as fallback.

3) Pass resolved userId through commit scan path
- Update `fetchCommitsPerRepo` signature to accept optional `githubUserId`.
- Use new trailer matcher inside its commit filter.
- In main user loop:
  - Resolve user id once before commit fetch.
  - Pass `githubUserId` to `fetchCommitsPerRepo`.
- Keep chunking/time-budget behavior unchanged.

4) Add focused tests for renamed-username scenario
- File: `supabase/functions/github-sync-activity/index.test.ts`
- Add/adjust tests to cover:
  - Co-author trailer with old username + current username mapping + numeric id → match true.
  - Same trailer without matching id and without username hit → false.
  - Backward compatibility: direct username trailer still matches.
- Keep existing PR merged-by tests intact.

5) Validation after implementation
- Trigger GitHub sync from Settings (`days_back: 30`) and let chunk loop finish.
- Confirm edge logs show resolved GitHub user id and higher per-repo commit hits for Joachim.
- Query `external_activity` for Joachim + `source='github'` and verify commit count increases, including recent Lovable commits.
- Verify `/activity` with filters `GitHub + Joachim + Last 30 days` shows the new commits.

Technical details
- Files to update:
  - `supabase/functions/github-sync-activity/index.ts`
  - `supabase/functions/github-sync-activity/index.test.ts`
- No DB migration needed.
- No secret changes needed.
- Performance impact is minimal (one extra `/users/{username}` call per synced user, cached per invocation).
- Failure mode is safe: if user-id resolution fails, logic falls back to current username-based matching.

Optional follow-up (recommended for consistency)
- Apply the same rename-proof co-author matcher to `supabase/functions/github-fetch-activity/index.ts` so weekly digest metrics and manual activity sync use identical attribution rules.
