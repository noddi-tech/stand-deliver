

## Notifications Tab for Settings

### What it does

A new "Notifications" tab in Settings that gives visibility and control over all notification channels. It answers: what gets sent where, and how do reminders work?

### Notification types to display

| Notification | Destination | Configurable? |
|---|---|---|
| Standup summary | Slack channel (configured in Integrations) | Toggle on/off |
| Daily standup reminder | Slack DM to each member | Toggle on/off + time (from Schedule) |
| Blocker alerts | Slack channel | Toggle on/off |
| Weekly digest | Slack channel | Toggle on/off |

### Data model

New `notification_preferences` table to store per-team toggles:

```sql
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  notification_type text NOT NULL,  -- 'standup_summary', 'daily_reminder', 'blocker_alert', 'weekly_digest'
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, notification_type)
);
```

RLS: team members can view, team leads can update.

### UI Design

The tab shows a card-based layout with each notification type as a row:
- Icon + title + description of what it does
- Where it goes (e.g., "#general" or "DM to each member")
- Toggle switch to enable/disable
- Visual indicator if the destination isn't configured (e.g., no Slack channel set — link to Integrations tab)

### Files Changed

| File | Change |
|---|---|
| New `src/components/settings/NotificationsTab.tsx` | New component with notification preference cards and toggles |
| `src/pages/Settings.tsx` | Add Notifications tab between Members and Integrations |
| New migration | Create `notification_preferences` table with RLS |
| `src/integrations/supabase/types.ts` | Auto-updated |

### Implementation notes

- Toggles upsert into `notification_preferences` on change
- Default state (no row) = enabled, so existing behavior is preserved
- The Slack channel name is fetched from the team's `slack_channel_id` for display
- Each card shows a brief explanation: "Posts a formatted summary of all responses to your Slack channel after the standup window closes"
- If no Slack is connected, show a subtle banner linking to the Integrations tab

