

## Root Cause: GitHub Search API Does Not Index `ClickUpBotGOAT`

I tested the GitHub API directly using your stored PAT:
- **`andersliland`** → 12 commits today (Search API works)
- **`ClickUpBotGOAT`** → **0 commits, 0 PRs, 0 everything** (Search API returns nothing)

The same PAT, same date range, same code path. The GitHub **Search API** simply does not index commits for `ClickUpBotGOAT`. This is a known limitation — GitHub's Search indexer is unreliable for certain account types (bot accounts, machine users, or accounts with limited public activity). No amount of query tweaking will fix this.

## Fix: Use the Repository Commits API Instead of Search API

For users where the Search API fails, fall back to the **per-repo Commits API** (`GET /repos/{owner}/{repo}/commits?author={username}&since={date}`), which is reliable and works for all account types.

**Approach:**
1. First, try the Search API as today (works for most users)
2. If the Search API returns 0 results for a user, fall back to listing org repos via `GET /orgs/{org}/repos` and then querying each repo individually via `GET /repos/{owner}/{repo}/commits?author={username}&since={ISO date}`
3. For PRs, use `GET /repos/{owner}/{repo}/pulls?state=all&sort=updated&since={date}` filtered by the username

This fallback approach ensures `ClickUpBotGOAT`'s commits from `trackwise-inventory`, `stand-deliver`, `noddi-frontend`, etc. are all captured.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Add per-repo fallback when Search API returns 0 for a user: list org repos, then query each repo's commits endpoint |
| `supabase/functions/github-fetch-activity/index.ts` | Same fallback logic for the weekly activity fetch function |

### Key Detail
- The org repos list is fetched once per sync (not per user), so the overhead is minimal
- Per-repo commit queries are paginated but limited to the date range, so they return small result sets
- The fallback only triggers when Search returns 0, so existing users (like `andersliland`) are unaffected

