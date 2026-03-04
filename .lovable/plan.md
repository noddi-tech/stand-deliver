

# Slack Integration for StandFlow

## Current State
The app only has Auth and a placeholder Dashboard. There is no Settings page, no sidebar, no app shell yet. The plan calls for building Phases 2-8 incrementally. This Slack integration request jumps ahead to what would be Phase 8 (Settings/Integrations) plus new edge functions.

## What to Build

### 1. Database Migration
Create two new tables with RLS:

- **slack_installations** — stores bot tokens per org/workspace. Columns: id, org_id (FK organizations), workspace_id, workspace_name, bot_token, bot_user_id, installing_user_id (FK profiles), installed_at, unique(org_id, workspace_id). RLS: org members can view/insert/update.

- **slack_user_mappings** — links app users to Slack user IDs. Columns: id, org_id (FK organizations), user_id (FK profiles), slack_user_id, slack_display_name, created_at, unique(org_id, slack_user_id). RLS: org members can view/insert/update.

### 2. Settings Page with Integrations Tab
Create `/settings` route with a tabbed layout (Team, Schedule, Members, Integrations). Focus on the Integrations tab:

- **Connect to Slack** button that opens Slack OAuth URL (`https://slack.com/oauth/v2/authorize`) in a new window with required scopes (chat:write, commands, im:write, users:read, channels:read)
- After connection: show workspace name, green connected badge, channel selector dropdown (fetched from Slack API via edge function)
- **Slack User Mapping** section: table of team members with input fields to link Slack user IDs
- **Slack Preview** component: static mockup showing what the bot DM reminder and channel summary messages look like in Slack Block Kit style

### 3. Edge Functions (5 functions)

**a. slack-oauth-callback** — Handles OAuth redirect from Slack. Exchanges authorization code for bot token via `oauth.v2.access`, stores result in `slack_installations`, redirects user back to `/settings?tab=integrations&slack=connected`.

**b. slack-send-reminder** — Accepts `team_id`. Looks up team members with Slack mappings, fetches their carried/active commitments, sends a DM to each via `chat.postMessage` with Block Kit blocks (commitment list + Start/Snooze/Skip action buttons).

**c. slack-collect-response** — Handles Slack interactive payloads (`type: block_actions`). Parses action (start/snooze/skip/done/blocked), creates or updates `standup_response` and `commitment` records accordingly. Returns updated message.

**d. slack-post-summary** — Accepts `session_id`. Fetches all responses for the session, formats as a single Block Kit message with sections per member (mood, resolved items, new focus, blockers), posts to team's Slack channel. Includes footer with response count.

**e. slack-slash-handler** — Handles three slash commands:
  - `/standup` — triggers standup collection for the user's team
  - `/standup-status` — returns the user's open commitments as an ephemeral message
  - `/standup-blocker` — quick-logs a blocker from the slash command text

### 4. Secrets Required
- `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET` — needed for OAuth flow. Will prompt user to add these via the secrets tool.

### 5. Frontend Components
- `src/pages/Settings.tsx` — tabbed settings page
- `src/components/settings/IntegrationsTab.tsx` — Slack connect button, status display, channel selector, user mapping table
- `src/components/settings/SlackPreview.tsx` — static Block Kit mockup
- `src/components/settings/TeamTab.tsx`, `ScheduleTab.tsx`, `MembersTab.tsx` — placeholder tabs
- Update `App.tsx` with `/settings` route

### 6. Security Notes
- Bot tokens stored in `slack_installations` are sensitive. RLS restricts to org members only. For production, these should ideally be encrypted or stored in Vault, but for MVP, RLS-protected storage is acceptable.
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS when needed for bot operations.
- Slash command handler verifies Slack signing secret.

