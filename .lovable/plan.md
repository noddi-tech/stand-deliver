

## Problem

The auto-link logic (`slack-auto-link` edge function) matches users by email, but it's **only triggered for the current user** via the "Link My Account" button. For other team members like Mattis, the UI falls back to a manual dropdown — even though the system has their `user_id` and could look up their email and match it to Slack automatically.

## Plan

### Auto-link all unlinked members on page load

In `IntegrationsTab.tsx`, after `teamMembers` and `slackInstallation` are loaded, automatically attempt to link any unlinked members by calling `slack-auto-link` for each one. This is a fire-and-forget batch operation that runs once when the data is available.

- Add a `useEffect` that fires when `teamMembers` loads
- For each member where `slack_user_id` is null, call `slack-auto-link` with their `member_id` and `user_id`
- On success, invalidate the `team-members-for-mapping` query to refresh the table
- Use a ref to prevent re-running on every render
- Errors are silently ignored (the manual dropdown remains as fallback)

### Files Changed

| File | Change |
|------|--------|
| `src/components/settings/IntegrationsTab.tsx` | Add `useEffect` to auto-link all unlinked members when data loads |

