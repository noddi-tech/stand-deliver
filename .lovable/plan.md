

## Auto-Sync External Activity + Always-On Tracking (Including Weekends)

### Summary

Create an `external_activity` table and two sync edge functions (ClickUp + GitHub) that poll for activity. Sync runs every day (including weekends). The daily Slack digest only posts on weekdays, but Monday's digest covers Saturday + Sunday activity. The existing `daily-summary-cron` also needs updating to remove the standup-day gate and query a wider date range on Mondays.

### Database

**New table: `external_activity`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| team_id | uuid | FK teams |
| member_id | uuid | FK team_members |
| source | text | 'clickup' / 'github' |
| activity_type | text | 'task_completed', 'task_started', 'pr_opened', 'pr_merged', 'commit', 'pr_review' |
| title | text | Task/PR/commit name |
| external_id | text | Dedup key |
| external_url | text | Link |
| metadata | jsonb | Extra data |
| occurred_at | timestamptz | When it happened |
| created_at | timestamptz | Default now() |
| is_acknowledged | boolean | Default false |

RLS: team members can read/update their team's rows.
Unique constraint on `(external_id, activity_type, source)` for dedup.

### New Edge Functions

**1. `clickup-sync-activity`**
- For each team with ClickUp installed, for each mapped user:
  - Fetch tasks updated today (use `date_updated_gt` filter with ClickUp API)
  - Detect status changes: tasks moved to "complete"/"done"/"closed" → `task_completed`; moved to "in progress" → `task_started`
  - Insert into `external_activity`, dedup by external_id + activity_type + date

**2. `github-sync-activity`**
- For each team with GitHub installed, for each mapped user:
  - Fetch today's commits (`committer-date:YYYY-MM-DD`)
  - Fetch today's PRs opened (`created:YYYY-MM-DD`)
  - Fetch today's PRs merged (`merged:YYYY-MM-DD`)
  - Insert into `external_activity`, dedup by external_id

### Cron Schedule

**Activity sync**: every 30 minutes, every day (including weekends)
```
*/30 * * * *
```
Triggers both `clickup-sync-activity` and `github-sync-activity`.

**Daily digest (existing `daily-summary-cron`)**: keep at 17:00 UTC, weekdays only
```
0 17 * * 1-5
```

### Changes to `daily-summary-cron`

1. **Remove the standup-day gate** (line 41: `if (!team.standup_days?.includes(todayDay)) continue`) — the digest should post every weekday regardless of standup schedule
2. **On Mondays, expand the date range** to cover Saturday + Sunday: query `commitment_history`, `blockers`, and `external_activity` from Saturday 00:00 through Monday 23:59
3. **Include external activity counts** in the Slack digest message:
   - "🔗 12 commits across 3 repos"
   - "🔀 2 PRs merged, 1 opened"
   - "📋 5 ClickUp tasks completed, 3 started"

### UI Changes (`src/pages/MyStandup.tsx`)

**New "Recent Activity" section** above the standup form:
- Query `external_activity` for current user today where `is_acknowledged = false`
- Group by source (ClickUp icon / GitHub icon)
- Each item shows: icon, title, type badge, timestamp, link
- "Add to standup" button → adds completed items to "What did you do?" text, in-progress items as commitments
- "Dismiss" button → marks `is_acknowledged = true`

### Files Changed

| File | Change |
|------|--------|
| Migration | Create `external_activity` table + RLS + unique constraint |
| `supabase/functions/clickup-sync-activity/index.ts` | **New** — poll ClickUp for task status changes |
| `supabase/functions/github-sync-activity/index.ts` | **New** — poll GitHub for commits/PRs/merges |
| `supabase/functions/daily-summary-cron/index.ts` | Remove standup-day filter; expand date range on Mondays; include external activity counts |
| `supabase/config.toml` | Add new function entries |
| `src/pages/MyStandup.tsx` | Add "Recent Activity" section with add/dismiss |
| Database (insert tool) | pg_cron job for 30-min sync; update existing daily digest cron to weekdays only |

