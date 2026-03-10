

## Fix: Stale Pending Invites + Add Manual Sync Button

### Issue 1: Manual Sync Invocation
Add a "Sync Now" button to the Integrations tab (or Activity page) that lets leads manually trigger `github-sync-activity` and `clickup-sync-activity` edge functions. This avoids needing to go to the Supabase dashboard.

### Issue 2: Stian's Pending Invite
The `slack_invites` table never gets updated when an invited user actually signs up and joins the team. Stian is already in `team_members` but his invite row still says `status = 'pending'`.

**Fix approach:** In `MembersTab.tsx`, after fetching both `members` and `pendingInvites`, filter out any pending invites where the `slack_user_id` matches a Slack user ID of an existing team member. This requires cross-referencing with `slack_user_mappings` or simply checking if the invite's display name matches an existing member.

**Better approach:** Update the invite status to `accepted` when a user joins. The `slack-auto-link` or onboarding flow should mark matching invites as accepted. Additionally, add a defensive client-side filter as a fallback.

### Files Changed

| File | Change |
|------|--------|
| `src/components/settings/MembersTab.tsx` | Filter pending invites against existing team members by cross-referencing slack_user_mappings |
| `supabase/functions/slack-auto-link/index.ts` | When auto-linking a user, update any matching `slack_invites` row to `status = 'accepted'` |
| `src/components/settings/IntegrationsTab.tsx` | Add "Sync Now" buttons for GitHub and ClickUp that invoke the sync edge functions |

