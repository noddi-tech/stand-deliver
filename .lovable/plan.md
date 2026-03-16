

# Fix "Start Standup" Slack Button to Open StandFlow

## Problem

The "Start Standup" button in Slack currently triggers an interactive action that just replies with text ("Head to StandFlow to complete your standup"). It does not actually open the app. The user expects clicking the button to open the My Standup page.

## Solution

Change the "Start Standup" button in `slack-send-reminder` from an interactive `action_id` button to a **URL button** (`url` property). Slack URL buttons open the link directly in the user's browser -- no interactivity endpoint needed.

The published app URL is `https://standup-flow-app.lovable.app/my-standup`.

## Files to change

| File | Change |
|---|---|
| `supabase/functions/slack-send-reminder/index.ts` | Change the "Start Standup" button from `action_id: "start_standup"` to a `url` button pointing to `/my-standup`. Remove `value` since URL buttons don't need it. |
| `supabase/functions/slack-collect-response/index.ts` | Remove the `start_standup` case from the switch (no longer needed since the button opens a URL directly). |

### Button change detail

```typescript
// Before
{
  type: "button",
  text: { type: "plain_text", text: "▶️ Start Standup" },
  style: "primary",
  action_id: "start_standup",
  value: JSON.stringify({ team_id, member_id: member.id }),
}

// After
{
  type: "button",
  text: { type: "plain_text", text: "▶️ Start Standup" },
  style: "primary",
  url: "https://standup-flow-app.lovable.app/my-standup",
}
```

This is a minimal, targeted fix. The Snooze and Skip buttons remain as interactive actions since they need server-side logic.

