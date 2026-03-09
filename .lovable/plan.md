

## Two improvements to Notifications + Integrations

### 1. Show actual channel name in Notifications badges

Currently the badge always says "Slack channel" (hardcoded). The `slackChannelName` state is set to `"#channel"` (line 89) instead of the real name.

**Fix in `NotificationsTab.tsx`:**
- Query `teams.slack_channel_id` (already fetched) and use the channel ID to look up the name via `slack-list-channels` edge function, or store/fetch the channel name alongside the ID
- Simpler approach: fetch channels list using the same `slack-list-channels` call, find the matching one, and display `#standups` (or whatever it is) in the badge instead of generic "Slack channel"
- For DM notifications, keep "DM to each member" as-is

### 2. Replace open dropdown with confirmed-state channel selector

Currently the channel is an always-open `<Select>` dropdown that changes immediately on click — too easy to accidentally swap.

**Redesign in `IntegrationsTab.tsx`:**
- When a channel is already selected, show it as a confirmed display (channel name + green checkmark badge, similar to linked accounts)
- Add a small "Change" button to enter edit mode
- Only in edit mode show the `<Select>` dropdown + a "Save" / "Cancel" button pair
- This matches the pattern used in Slack User Mapping where linked accounts show as confirmed state

### Files Changed

| File | Change |
|------|--------|
| `src/components/settings/NotificationsTab.tsx` | Fetch actual channel name via `slack-list-channels`; display real `#channel-name` in badges |
| `src/components/settings/IntegrationsTab.tsx` | Replace always-open Select with confirmed state + "Change" button edit mode |

