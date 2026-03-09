## Completed

### Slack channel selector (IntegrationsTab)
- Channel dropdown now saves to `teams.slack_channel_id` on change
- Initializes with current team's linked channel
- Shows success toast with channel name

### Slack invite system (MembersTab + Edge Function)
- New `slack-send-invite` edge function sends a DM with Block Kit invite button
- MembersTab shows "Invite via Slack" card with user picker when Slack is connected
- Invited users click the link, sign in with Slack OIDC, and auto-join the org

### Edit Daily Standup
- Added UPDATE RLS policy on `standup_responses`
- Edit button loads existing data back into form
- Re-submit updates existing response and commitments

### AI Standup Coach (Phase 1)
- `ai-coach-standup` edge function reviews commitments via Lovable AI Gateway
- Uses tool calling for structured output (suggestions with category, issue, rewrite)
- `StandupCoachCard` component shows inline coaching before submit
- Submit button triggers AI review first; user can apply/dismiss/submit anyway

## Planned

### ClickUp Integration (Phase 2)
- `clickup_user_mappings` table + RLS
- `clickup-fetch-tasks` edge function to pull assigned tasks
- Settings > Integrations: ClickUp connection card
- MyStandup: "Import from ClickUp" button in Today's Focus
