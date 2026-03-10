

## Plan: Skip Standup, Fix Slack Notifications, Add Activity to Dashboard

### 1. Skip Today's Standup (UI)

Currently there's no way to skip a standup from the UI. The Slack reminder has "Skip Today" but no web equivalent.

**Changes:**
- **`src/pages/Dashboard.tsx`**: Add a "Skip Today" button next to "Start Today's Standup" / "Complete Your Standup". When clicked, create the session (if needed) and insert a standup response with `yesterday_text: "Skipped"`, `submitted_via: 'web'`, and a null mood, so the member is marked as having responded.
- **`src/pages/MyStandup.tsx`**: Add a "Skip Today" option (secondary button or link) visible when the user hasn't submitted yet. It creates a minimal response marking the standup as skipped.
- **`src/hooks/useTeamMetrics.ts`**: Update `useTodaySession` to also return a `"skipped"` status so the Dashboard can show "Skipped today" instead of the submit button.

### 2. Fix Slack Notifications Not Firing

**Root cause**: There is no `pg_cron` job that triggers `slack-send-reminder`. The function exists but nothing calls it automatically. The daily digest cron exists (`0 17 * * 1-5`) and the sync crons exist, but reminder cron was never created.

**Changes:**
- **New migration**: Create a `pg_cron` job that runs at the team's configured standup time. Since teams have different `standup_time` and `standup_timezone` settings, the simplest approach is a single cron that runs every 15 minutes and a new edge function `slack-reminder-cron` that checks which teams should receive reminders now (comparing current time to `standup_time` + `standup_timezone`).
  
  ```
  SELECT cron.schedule('slack-standup-reminders', '*/15 * * * *', ...invoke slack-reminder-cron...)
  ```

- **New edge function `slack-reminder-cron/index.ts`**: 
  - Get all teams with Slack connected
  - For each team, check if current time (in the team's timezone) matches `standup_time` (within 15-min window) and today's day-of-week is in `standup_days`
  - If yes, call `slack-send-reminder` with that team's ID
  - Also creates the standup session for today if it doesn't exist yet

- **`supabase/config.toml`**: Add entries for `slack-reminder-cron` and `slack-send-reminder`

### 3. Dashboard Activity Section

The dashboard currently shows metrics, attention items, and team member cards. Add an **Activity Feed** section showing recent external activity (from ClickUp and GitHub) and standup submissions, grouped per user and per team.

**Changes:**
- **New hook `src/hooks/useRecentActivity.ts`**:
  - Query `external_activity` for the team, last 7 days, ordered by `occurred_at` desc
  - Query `standup_responses` for the team, last 7 days
  - Return combined, sorted by timestamp

- **`src/pages/Dashboard.tsx`**: Add two new sections below "Needs Attention":

  **a) "Recent Activity" feed** (team-level):
  - Shows a chronological list of the last ~20 activities: commits, PRs, ClickUp task completions, standup submissions
  - Each item shows: icon (GitHub/ClickUp/standup), member avatar + name, title, relative timestamp
  - Filterable by source (All / GitHub / ClickUp / Standups)

  **b) Enhanced Team Members cards**:
  - Add activity counts to each member card: e.g., "3 commits, 1 PR, 2 tasks" for the current week
  - This extends the existing `useTeamMembersStatus` hook to also query `external_activity` per member

### Files Changed

| File | Change |
|------|--------|
| New: `supabase/functions/slack-reminder-cron/index.ts` | Checks team schedules, triggers reminders |
| New migration | `pg_cron` job for reminder every 15 min |
| `supabase/config.toml` | Add `slack-reminder-cron`, `slack-send-reminder` entries |
| `src/pages/Dashboard.tsx` | Add Skip button, Recent Activity feed, enhanced member cards |
| `src/pages/MyStandup.tsx` | Add Skip Today button |
| `src/hooks/useTeamMetrics.ts` | Support skipped status |
| New: `src/hooks/useRecentActivity.ts` | Fetch external_activity + responses for dashboard |
| `src/hooks/useTeamMembers.ts` | Add per-member activity counts |

