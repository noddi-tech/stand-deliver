## Completed

### Slack channel selector (IntegrationsTab)
- Channel dropdown now saves to `teams.slack_channel_id` on change
- Initializes with current team's linked channel
- Shows success toast with channel name

### Slack invite system (MembersTab + Edge Function)
- New `slack-send-invite` edge function sends a DM with Block Kit invite button
- MembersTab shows "Invite via Slack" card with user picker when Slack is connected
- Invited users click the link, sign in with Slack OIDC, and auto-join the org
