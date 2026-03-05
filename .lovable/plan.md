

## Root Cause Analysis

### 1. RLS INSERT Still Failing (403)
Despite `pg_policies` reporting PERMISSIVE, the INSERT on `organizations` still fails with error 42501. The `<supabase-tables>` schema dump consistently shows `Permissive: No` on every table. Rather than chase this contradiction further, the cleanest fix is to **bypass RLS entirely for the onboarding flow** using a `SECURITY DEFINER` RPC function. This is the correct pattern for multi-table atomic operations (create org + add member) during onboarding.

### 2. Slack Workspace Name Not Detected
The code looks for `user.user_metadata["https://slack.com/team_name"]`, but the actual Slack OIDC data structure is:
```json
{ "custom_claims": { "https://slack.com/team_id": "T02KWR5S290" } }
```
- `team_id` is nested under `custom_claims`, not at the top level
- `team_name` is **not included at all** in the OIDC token

### 3. /auth Redirects When Session Exists
User wants: keep auto-redirect, but add a "Sign out and switch workspace" button.

---

## Plan

### A. Database: Create `create_org_and_join` RPC (migration)
A `SECURITY DEFINER` function that:
- Accepts `p_name text`, `p_slug text`, `p_slack_workspace_id text DEFAULT NULL`
- Checks if an org with that `slack_workspace_id` already exists → if so, adds user as member and returns that org ID
- Otherwise creates the org, adds user as owner, returns new org ID
- Runs as postgres owner, bypassing all RLS

### B. Edge Function: `slack-team-info`
- Accepts `team_id` parameter
- Uses `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET` (already stored) to call Slack's `team.info` API via a client credentials approach, or accepts the user's provider_token from the frontend
- Returns `{ team_name: string }`
- Actually: Slack's `team.info` requires a user/bot token, not client credentials. We'll pass the `provider_token` from `session.provider_token` on the frontend.

### C. Update `Onboarding.tsx`
- Fix Slack metadata extraction: check `user.user_metadata?.custom_claims?.["https://slack.com/team_id"]`
- On mount, if `team_id` is found but no `team_name`, call the `slack-team-info` edge function with `session.provider_token` to fetch the workspace name
- Replace direct Supabase INSERT with `supabase.rpc("create_org_and_join", { ... })` call
- This eliminates the RLS issue entirely

### D. Update `Auth.tsx`
- When a session exists, show a "Sign out & switch workspace" button alongside the redirect

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/...` | `create_org_and_join` SECURITY DEFINER function |
| `supabase/functions/slack-team-info/index.ts` | Edge function to fetch workspace name via Slack API |
| `src/pages/Onboarding.tsx` | Fix metadata keys, use RPC for org creation, fetch workspace name |
| `src/pages/Auth.tsx` | Add sign-out button when session exists |

