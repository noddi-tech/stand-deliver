

## Problem

The GitHub and ClickUp cron jobs run every 30 minutes, and they **do** use the same user mappings (`github_user_mappings` / `clickup_user_mappings`). So the mapping logic is correct.

However, there's a bug with the **GitHub cron**: the function processes users in paginated chunks (default `limit_users = 2`, starting at `offset = 0`). The manual sync UI loops through all pages, but the cron job fires a **single request** with no offset — so it only ever syncs the first 2 users. If Joachim's mapping isn't in the first 2, his activity never gets synced automatically.

The ClickUp cron is fine — it processes all installations and all mappings in a single call with no pagination.

## Plan

### 1. Make `github-sync-activity` auto-page when called by cron

When no `org_id` is provided (i.e., cron mode), the function should process **all** users instead of just the first 2. Two approaches:

**Option A (simpler):** When called without explicit `limit_users`/`offset` params, set `limitUsers` to a high number (e.g., 50) so all users are processed in one shot. The time budget (120s) already handles graceful cutoff.

**Option B (robust):** Have the function call itself recursively if `has_more` is true — but this adds complexity and potential infinite loops.

**Recommendation: Option A.** Change the default `limitUsers` from `2` to `50` when no explicit pagination params are provided. The `2` limit was designed for the UI's progress bar, not for cron. The 120-second time budget already prevents runaway execution.

### 2. Changes

**`supabase/functions/github-sync-activity/index.ts`** (lines 478-490):
- Change default `limitUsers` from `2` to `50`
- Keep the ability for the UI to pass `limit_users: 2` for progress bar behavior

This is a one-line change: `let limitUsers = 50;` instead of `let limitUsers = 2;`.

The cron body is `{"time": "..."}` which doesn't include `limit_users`, so it will use the new default of 50 and process all mapped users in one invocation.

