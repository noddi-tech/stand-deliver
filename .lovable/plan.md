

## Plan: Auto-create Organization from Slack Workspace

When a user signs in via Slack OIDC, Supabase stores Slack workspace metadata in `user.user_metadata` (fields like `https://slack.com/team_name` and `https://slack.com/team_id`, or possibly `slack_team_name`/`slack_team_id`). We can use this to skip or pre-fill the organization step.

### Approach

**Modify `src/pages/Onboarding.tsx` (step 0)**:

1. On mount, read `user.user_metadata` to extract Slack workspace name and ID
2. Check if an organization already exists for this Slack workspace (query `organizations` by slug or add a `slack_workspace_id` column)
3. If workspace info is available, show a pre-filled card: "We detected your Slack workspace: **{workspace_name}**. Use this as your organization?" with a "Use this workspace" button and a "Use a different name" link that reveals the manual input
4. If no Slack metadata (e.g. email sign-in), show the existing manual form as-is

**Database migration** — add `slack_workspace_id` column to `organizations`:

```sql
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS slack_workspace_id text UNIQUE;
```

This lets us match returning users to existing orgs by Slack workspace ID, preventing duplicate orgs for the same workspace.

**Modified `handleCreateOrg`**:
- When creating from Slack, populate `slack_workspace_id` on the org
- Before creating, check if an org with that `slack_workspace_id` already exists — if so, just add the user as a member and skip to step 1

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/...` | Add `slack_workspace_id` column to `organizations` |
| `src/pages/Onboarding.tsx` | Read Slack metadata from `user.user_metadata`, pre-fill org name, auto-join existing workspace org |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |

### UX Flow

1. User signs in with Slack → redirected to onboarding
2. Step 0 shows: "Your Slack workspace: **Acme Corp**" with pre-filled org name and a prominent "Continue" button
3. User can edit the name or accept as-is
4. If another user from the same Slack workspace already created the org, the new user is auto-added as a member and skips to step 1 (team creation)

