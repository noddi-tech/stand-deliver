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

### ClickUp Integration (Phase 2)
- `clickup_installations` + `clickup_user_mappings` tables with RLS
- `clickup-setup` edge function validates token, stores installation, lists members
- `clickup-fetch-tasks` edge function pulls assigned tasks from ClickUp API
- `ClickUpSection` component: 3-step wizard (token → connect → map users)
- Settings > Integrations: ClickUp connection card with setup instructions
- MyStandup: "Import from ClickUp" button + task picker dialog in Today's Focus

### ClickUp Status Sync
- Added `clickup_task_id` column to `commitments` table
- `clickup-update-task` edge function syncs status changes to ClickUp API
- Fuzzy-matches StandFlow statuses to ClickUp's custom per-list statuses
- MyStandup stores `clickup_task_id` on import, fires sync on status change

### Bug Fixes (ClickUp RLS + Standup Duplicate Key)
- Updated INSERT policy on `clickup_user_mappings` to allow org members to map any user
- Replaced conditional insert/update on `standup_responses` with idempotent upsert

### GitHub Integration + Cross-Platform Weekly Digest
- `github_installations` + `github_user_mappings` tables with RLS
- `github-setup` edge function validates PAT, stores installation, lists org members
- `github-fetch-activity` edge function fetches commits, PRs, reviews via GitHub Search API
- `GitHubSection` component: setup wizard (token + org name → user mapping)
- Settings > Integrations: GitHub connection card after ClickUp
- `ai-weekly-digest` enhanced to aggregate GitHub + ClickUp + StandFlow activity
- `cross_platform_activity` JSONB column on `ai_weekly_digests`
- WeeklyDigest page shows cross-platform activity card (StandFlow, GitHub, ClickUp)
- Slack summary includes GitHub stats when available
