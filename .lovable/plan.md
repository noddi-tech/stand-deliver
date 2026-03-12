

## Problem

The rename-proof co-author detection is deployed but **failing silently**. Logs confirm:
- `resolveGitHubUserId` resolved IDs for 4 users (andersliland, mattisaa, syver-sk, stiangrim) but was **never logged for Jokkos1337** — the API call to `/users/Jokkos1337` likely got rate-limited after hundreds of calls for prior users
- With `githubUserId = null`, the co-author check falls back to `message.includes("jokkos1337")` which still misses trailers containing "ClickUpBotGOAT"
- Result: "Per-repo scan found 0 additional commits for Jokkos1337 (total: 1)"

## Fix: Persist GitHub user ID in the database

Instead of resolving the GitHub user ID via API on every sync (which is fragile under rate limits), store it in `github_user_mappings` and resolve it once.

### 1. Add `github_user_id` column to `github_user_mappings`

```sql
ALTER TABLE github_user_mappings ADD COLUMN github_user_id bigint;
```

### 2. Update `github-sync-activity` to use stored ID with lazy resolution

- Read `github_user_id` from the mapping query (line ~387): add it to the select
- If `github_user_id` is null, call `resolveGitHubUserId` and **persist it** back to the row
- Add failure logging to `resolveGitHubUserId` so rate-limit errors are visible
- Pass the stored/resolved ID to `fetchCommitsPerRepo`

### 3. Update `github-setup` to resolve and store ID at setup time

- When a user maps their GitHub username during onboarding/settings, call `GET /users/{username}` and store the numeric ID immediately
- This eliminates the need for runtime resolution entirely after first setup

### 4. Backfill existing mappings

- Add a one-time backfill in the sync function: if `github_user_id` is null, resolve and persist it
- After first successful sync, all subsequent syncs use the stored value

### Files changed
- New migration: add `github_user_id bigint` column to `github_user_mappings`
- `supabase/functions/github-sync-activity/index.ts` — read stored ID, lazy-resolve + persist, add failure logging
- `supabase/functions/github-setup/index.ts` — resolve and store ID during setup

