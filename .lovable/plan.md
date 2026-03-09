

## Problem

Two issues identified:

1. **No Slack notification after standup submit** — The `slack-post-summary` edge function exists and works, but `MyStandup.tsx` never calls it after submission. The standup is saved to the database but no Slack message is sent.

2. **No invite tracking** — The invite flow fires a Slack DM and shows a success toast, but there's no record of who was invited or their status (pending/joined). Users have no way to see who they've already invited.

## Plan

### 1. Post standup summary to Slack after submission

In `MyStandup.tsx`, after the standup response is inserted and commitments are created, call the `slack-post-summary` edge function with the `session_id`. This will post the formatted summary to the team's configured Slack channel.

- Add a call after line ~263 (after "Standup submitted!" toast): `supabase.functions.invoke("slack-post-summary", { body: { session_id: sessionId } })`
- Fire-and-forget (don't block the UI on it) — log errors but don't show them to the user since the standup itself succeeded
- Only call if a Slack channel is configured (check `teams.slack_channel_id` exists)

### 2. Add invite tracking with a `slack_invites` table

Create a simple table to track sent invites:

```sql
CREATE TABLE public.slack_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  team_id uuid NOT NULL,
  slack_user_id text NOT NULL,
  slack_display_name text,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slack_user_id)
);
```

With RLS policies for org members to view/insert.

Then update:
- **`slack-send-invite` edge function** — insert a row into `slack_invites` when the DM is sent
- **`MembersTab.tsx`** — fetch `slack_invites` for the org and show pending invites below the member list (name, "Pending" badge, timestamp)
- Filter the Slack user dropdown to exclude already-invited users and existing members

### Files Changed

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Call `slack-post-summary` after successful standup submission |
| `supabase/functions/slack-send-invite/index.ts` | Record invite in `slack_invites` table |
| `src/components/settings/MembersTab.tsx` | Show pending invites section, filter already-invited users from dropdown |
| New migration | Create `slack_invites` table with RLS |

