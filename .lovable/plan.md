## Completed

### Phase 1 — Enrich GitHub Sync (Data Foundation)
- `github-sync-activity` now fetches commit stats (additions/deletions/files_changed) via `/repos/{owner}/{repo}/commits/{sha}`
- PR detail stats fetched (additions/deletions/changed_files) + review data (review_count, first_review_at, reviewer list)
- PR reviews stored as separate `pr_review` activity items attributed to the reviewer (not the PR author)
- AI commit classification via Lovable AI Gateway: batch classifies commit messages as feature/bugfix/refactor/chore/infra, stored as `metadata.work_type`
- All enrichment respects the 120s time budget — skips enrichment if <15s remaining
- No schema changes needed — all data stored in existing `external_activity.metadata` JSONB

### Phase 2 — Enhanced Analytics Dashboard
- New `useEnrichedAnalytics.ts` hook computes Code Impact Score, PR Cycle Time, Review Velocity, Focus Score from enriched metadata
- Team Analytics page: engineering metrics row (Avg PR Cycle Time, Avg Review Turnaround, Reviews Given)
- Team Analytics: PR Cycle Time trend chart, Code Impact bar chart, AI-classified Work Distribution
- Member Breakdown cards now show Impact Score, reviews given, and cycle time
- MyAnalytics: PR Cycle Time trend, Reviews Given vs Received, Code Impact, Focus Score, AI Work Types
- Data-driven personal insights generated from enriched metrics

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

### Fix Duplicate Slack Summaries + Daily Digest Cron
- Removed per-submission `slack-post-summary` call from MyStandup.tsx (was firing on every individual submission)
- Removed duplicate Slack posting from `ai-summarize-session` (now only generates + stores AI summary)
- Added `ai-summarize-session` + `slack-post-summary` calls to Meeting Mode completion
- New `daily-summary-cron` edge function aggregates daily activity (completions, new tasks, carried, blockers) and posts end-of-day digest to Slack
- pg_cron job scheduled at 17:00 UTC weekdays to trigger the daily digest automatically

### Auto-Sync External Activity (ClickUp + GitHub)
- New `external_activity` table with RLS, unique dedup constraint on `(external_id, activity_type, source)`
- `clickup-sync-activity` edge function polls ClickUp for task status changes (completed, in-progress)
- `github-sync-activity` edge function polls GitHub for commits, PRs opened, PRs merged
- pg_cron jobs run both sync functions every 30 minutes, 7 days/week (including weekends)
- `daily-summary-cron` updated: removed standup-day gate, Monday digest covers Sat+Sun, includes external activity counts (commits, PRs, ClickUp tasks)
- MyStandup "Recent Activity" section shows unacknowledged external events with Add/Dismiss actions
- Completed items get acknowledged; in-progress/opened items get added as today's focus commitments

### Activity Feed Bug Fixes
- Fixed `__none__` GitHub username causing bogus commits from random strangers (176 rows deleted)
- Fixed standup responses not appearing in activity feed (broken PostgREST nested filter)
- Broadened ClickUp sync to capture all task updates, not just completed/in-progress
- Redeployed all sync edge functions (clickup-sync-activity, github-sync-activity, github-fetch-activity)
- Replaced fragile nested PostgREST filter with two-step session-based query for standup responses

### GitHub Sync Date Range Fix
- Changed `github-sync-activity` from single-date to range-based queries (`committer-date:${start}..${end}`)
- Added optional `days_back` parameter (default: 1, max: 90)
- Manual "Sync GitHub" button now passes `days_back: 30` to backfill historical activity
- Fixes missing activity for users whose commits weren't captured by single-date GitHub Search API queries

### GitHub Per-Repo Fallback for Unindexed Users
- GitHub Search API does not index certain accounts (bot/machine users like `ClickUpBotGOAT`)
- Added per-repo fallback: if Search API returns 0 commits for a user, lists org repos via `/orgs/{org}/repos` and queries each repo's Commits API (`/repos/{owner}/{repo}/commits?author={username}&since=...`)
- Same fallback for PRs opened/merged using the Pulls API
- Applied to both `github-sync-activity` and `github-fetch-activity` edge functions
- Org repos list is cached per sync invocation; fallback only triggers when Search returns 0

### Fix GitHub Activity Attribution for Merge-Only Users
- Removed broken Events API (`/users/{username}/events/orgs/{org}`) — only works for self-auth, not shared PAT
- Added `merged_by` matching to `fetchPRsPerRepo` — PRs merged (not just authored) by a user are now attributed
- Added `fetchMergedPRCommits` — fetches commits from PRs where user is merger but not author (Lovable bot PRs)
- Always runs per-repo merged PR check (not just as fallback) to ensure bot-authored PRs are captured
- Fixed date range bug: `daysBack=1` now correctly goes back 1 full day (was `daysBack-1` = 0 days)
- 9 Deno unit tests validating attribution logic, date range, and case-insensitivity
- Applied to both `github-sync-activity` and `github-fetch-activity` edge functions

### GitHub Sync Chunked Pagination (Timeout Fix)
- `github-sync-activity` now accepts `org_id`, `offset`, `limit_users` for paginated user processing
- Internal 120s time budget guard stops processing before 150s gateway timeout
- Returns `has_more`, `next_offset`, `total_users`, `processed_users` for client-driven pagination
- SyncNowCard loops calls automatically while `has_more` is true, with progress bar
- Org repos list cached per sync invocation across user chunks
- Eliminates 504 gateway timeouts that manifested as CORS errors in the browser

### Co-Author Detection + Activity Server-Side Filtering
- `fetchCommitsPerRepo` now checks `Co-authored-by:` trailers in commit messages (captures Lovable bot commits where user is co-author)
- Per-repo commit scan now always runs (not just as fallback when Search API returns 0), since Search API `author:`/`committer:` qualifiers never match co-authors
- Activity page filtering moved server-side: `memberFilter` and `sourceFilter` applied to Supabase queries before `limit(200)`, fixing the windowing bug where individual members' activity was crowded out
- Standup fetch skipped when source filter is `github` or `clickup` for faster queries

### Rename-Proof Co-Author Detection
- Added `resolveGitHubUserId(token, username)` helper — resolves current username to stable numeric GitHub user ID via `GET /users/{username}`, cached per sync run
- Added `isCoAuthorMatch(message, username, userId)` — checks `Co-authored-by:` trailers by both username string AND numeric noreply email pattern `<{userId}+...@users.noreply.github.com>`
- Updated `fetchCommitsPerRepo` to accept optional `githubUserId` parameter and use `isCoAuthorMatch` instead of plain `message.includes()`
- Main handler resolves GitHub user ID once per user before commit scan, passes it through
- Fixes attribution for renamed accounts (e.g., ClickUpBotGOAT → Jokkos1337) where Lovable bot writes old username in commit trailers but numeric ID (164879107) stays constant
- 16 Deno tests passing including 5 new rename-proof co-author scenarios

### Phase 3 — Achievement Badges
- `badge_definitions` table with 10 seeded badges (surgeon, janitor, speed_reviewer, promise_keeper, collaborator, shipper, streak, architect, first_commit, guardian)
- `member_badges` table with RLS (team members can view/insert), unique constraint on (member_id, badge_id, earned_at)
- `detect-badges` edge function evaluates badge criteria from `external_activity` + `commitments` data
- Checks: surgeon (bugfix PR <10 LOC), janitor (net negative LOC/week), shipper (PR merged <4h), streak (daily commits 2 weeks), promise_keeper (5-day commitment streak), speed_reviewer (3+ reviews), collaborator (3+ review recipients), first_commit (new repo)
- `useBadges.ts` hook with `useBadgeDefinitions`, `useTeamBadges`, `useMemberBadges`, `useBadgeLookup`
- `BadgeShowcase` component on MyAnalytics page — full badge grid with tooltips and earn dates
- `MemberBadgeIcons` inline component — emoji badges on Analytics member cards and Team Feed entries

### Phase 4 — Weekly Awards & Team Momentum
- `weekly_awards` and `dora_metrics` JSONB columns added to `ai_weekly_digests` table
- `useWeeklyAwards.ts` hook computes MVP (highest composite score), Unsung Hero (most reviews relative to own PRs), Momentum (biggest week-over-week improvement) from `external_activity` data
- DORA-style metrics: avg PR cycle time, PR merge rate, review turnaround — all with week-over-week trend arrows
- `ai-weekly-digest` edge function rewritten: reads `external_activity` directly (no more per-user `github-fetch-activity` calls), computes awards + DORA metrics server-side, stores in digest
- AI narrative prompt enriched with DORA metrics and award context for natural mentions
- Slack weekly digest now includes awards section and PR cycle time stat
- `WeeklyDigest.tsx` shows Weekly Awards card (trophy icon, member badges, stats) and Team Momentum card (3-column DORA grid with trend arrows)
- `TeamInsights.tsx` shows live awards from `useWeeklyAwards` hook + DORA metrics panel
- No individual leaderboard — awards celebrate specific contributions, not rankings


### GitHub Cron Sync Fix (All Users)
- Changed default `limitUsers` from `2` to `50` in `github-sync-activity` edge function
- Cron job (no `limit_users` param) now processes all mapped users in one invocation instead of only the first 2
- Manual sync UI still passes `limit_users: 2` for progress bar behavior
- 120-second time budget prevents runaway execution

### AI-Powered Focus Suggestions (Replace Recent Activity)
- Removed "Recent Activity" card from MyStandup (raw GitHub/ClickUp events)
- New `ai-suggest-focus` edge function gathers 7-day context (external activity, commitments, blockers, carry-overs) and calls Gemini via tool calling for structured suggestions
- MyStandup shows "Suggested Focus" card with AI-generated items (title, reason, priority) and "Add" button
- Suggestions cached for 5 minutes, graceful fallback on AI errors
- Auto-acknowledges all unacknowledged external activity on standup submit
