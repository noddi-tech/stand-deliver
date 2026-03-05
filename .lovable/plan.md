

## Problem

The Slack User Mapping section requires manually typing a Slack User ID (e.g. `U01ABCDEF`), which users won't know. There's no automatic linking or lookup mechanism.

## Solution

Replace the manual text input with an automatic "Link My Account" button that uses the Slack bot token to look up the user's Slack ID by their email address (via `users.lookupByEmail`). For other team members, provide a searchable dropdown of workspace users.

### Implementation

**1. New edge function: `slack-lookup-users`**
- Accepts `org_id` parameter
- Uses the bot token from `slack_installations` to call Slack's `users.list` API
- Returns a list of `{ id, name, real_name, email, avatar }` for all workspace members
- This gives us a directory to match against or pick from

**2. Auto-link for current user**
- On the Integrations page, for the row matching the current `user.id`, show a "Link My Account" button
- When clicked, call a new edge function `slack-auto-link` that:
  - Gets the user's email from `auth.users`
  - Calls Slack `users.lookupByEmail` using the bot token
  - Updates `team_members.slack_user_id` with the found Slack user ID
  - Also stores in `slack_user_mappings` table for the org-level mapping

**3. Dropdown for other members**
- For team leads/admins, replace the raw text input with a `Select` dropdown populated from the Slack workspace user list
- Shows real names so they're recognizable

**4. Update `IntegrationsTab.tsx`**
- Fetch Slack workspace users via the new edge function
- Render "Link My Account" button for current user's row
- Render a `Select` dropdown for other members' rows
- Show avatar + name in the dropdown options

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/slack-lookup-users/index.ts` | New: fetches workspace users via bot token |
| `supabase/config.toml` | Add `slack-lookup-users` entry |
| `src/components/settings/IntegrationsTab.tsx` | Replace text input with auto-link button + user dropdown |

