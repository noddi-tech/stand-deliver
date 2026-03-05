

## Two Issues Found

### Issue 1: Workspace name not fetched during onboarding
The `slack-team-info` edge function tries to call Slack's `team.info` API using `session.provider_token`. But Supabase's `slack_oidc` provider gives an **OIDC ID token**, not a Slack Web API token. It cannot call `team.info` — this silently fails. Additionally, `provider_token` is only available immediately after OAuth redirect and is lost on refresh.

The user's metadata confirms this — only `team_id` is in `custom_claims`, no `team_name`:
```json
{ "custom_claims": { "https://slack.com/team_id": "T02KWR5S290" } }
```

**Fix**: Since we can't get the workspace name from OIDC, we need to:
- Modify `create_org_and_join` RPC to return both `org_id` and `org_name` (as a composite/JSON) so returning users see the org they're joining
- In onboarding, when the RPC finds an existing org by workspace_id, skip org creation step and show "You're joining [Org Name]"
- For first-time org creation, user types the name manually (no auto-fill from Slack since it's not available)
- Remove the broken `slack-team-info` fetch from onboarding (it will never work with OIDC tokens)

### Issue 2: "Slack Client ID is not configured" in Settings
The `.env` has `VITE_SLACK_CLIENT_ID=""` (empty). The `SLACK_CLIENT_ID` exists as a Supabase secret but isn't exposed to the frontend. The "Connect to Slack" button checks `VITE_SLACK_CLIENT_ID` and shows the error toast.

**Fix**: Create a small edge function `get-slack-config` that returns the (public) client ID from server secrets. The IntegrationsTab fetches it on mount instead of relying on a frontend env var. This avoids duplicating the secret.

### Issue 3: Second user joining same workspace — team picker
User chose "Pick team in onboarding" for joining behavior. When `create_org_and_join` finds an existing org, the onboarding should:
- Show available teams in that org
- Let the user pick which team to join
- Skip org creation + team creation steps

---

## Implementation Plan

### A. Database: Update `create_org_and_join` to return org name
Modify the RPC to return `jsonb` containing `{ org_id, org_name, is_existing }` instead of just `uuid`. This lets the frontend know if the user joined an existing org and what it's called.

### B. Edge Function: `get-slack-config`
Simple function that returns `{ client_id: Deno.env.get("SLACK_CLIENT_ID") }`. No JWT required. Add to `config.toml`.

### C. Update `Onboarding.tsx`
- Remove the broken `slack-team-info` fetch
- After calling `create_org_and_join`, check `is_existing`:
  - If true: skip to a "Pick team" step showing available teams in the org
  - If false: proceed to team creation as normal
- For existing orgs, fetch available teams and let user select one to join

### D. Update `IntegrationsTab.tsx`
- Remove dependency on `VITE_SLACK_CLIENT_ID` env var
- Fetch client ID from `get-slack-config` edge function on mount
- Use that value in the OAuth URL

### E. Cleanup
- Remove `VITE_SLACK_CLIENT_ID` from `.env` (no longer needed)
- Remove or repurpose `slack-team-info` edge function (OIDC tokens can't use it)

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/...` | Alter `create_org_and_join` to return jsonb with org_id, org_name, is_existing |
| `supabase/functions/get-slack-config/index.ts` | New: returns SLACK_CLIENT_ID from secrets |
| `supabase/config.toml` | Add `get-slack-config` with verify_jwt=false |
| `src/pages/Onboarding.tsx` | Remove slack-team-info fetch, handle existing org + team picker flow |
| `src/components/settings/IntegrationsTab.tsx` | Fetch client ID from edge function instead of env var |
| `.env` | Remove empty VITE_SLACK_CLIENT_ID |

