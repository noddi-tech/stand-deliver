

## Fix Duplicate Slack Summaries + Add End-of-Day Cron Summary

### Problem
1. `slack-post-summary` fires on **every individual standup submission** (MyStandup.tsx line 551-564), causing duplicate Slack messages
2. `ai-summarize-session` also posts to Slack independently (line 112-123), compounding duplicates
3. No end-of-day summary of what actually changed throughout the day (completions, new tasks, blockers, etc.)

### Changes

#### 1. Remove per-submission Slack posting from MyStandup.tsx
Delete the fire-and-forget `slack-post-summary` call (lines 550-564). Individual submissions should not trigger a channel summary.

#### 2. Add summary call to Meeting Mode completion
In `MeetingMode.tsx`, after marking the session as completed (line 153-162), call `ai-summarize-session` which already handles both AI summary generation and Slack posting. This covers the "live standup" use case -- one summary when the meeting ends.

#### 3. Remove Slack posting from ai-summarize-session
Remove the Slack posting code from `ai-summarize-session/index.ts` (lines 98-123). This function should only generate and store the AI summary. Slack posting will be handled by `slack-post-summary` called separately.

#### 4. Create end-of-day cron edge function
New edge function: `daily-summary-cron/index.ts`

This function runs daily (e.g., 17:00 UTC, configurable) and for each team with a session that day:
- Gathers all **commitment status changes** from `commitment_history` for that day
- Counts completions, new commitments, carried/postponed items, new blockers, resolved blockers
- Calls `ai-summarize-session` to generate/store the AI summary
- Calls `slack-post-summary` to post a rich end-of-day digest to Slack

The summary message will look like:
```
📊 Daily Standup Digest — March 9
✅ 5 tasks completed
🆕 3 new commitments added  
🔄 2 tasks carried forward
🚫 1 new blocker · 2 blockers resolved
👥 4 of 6 members submitted standups

✨ AI Summary: The team made strong progress on...
```

#### 5. Set up pg_cron job
Enable `pg_cron` and `pg_net` extensions, then schedule:
```sql
select cron.schedule(
  'daily-standup-summary',
  '0 17 * * 1-5',  -- weekdays at 17:00 UTC
  $$ select net.http_post(...) $$
);
```

### Files Changed

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Remove slack-post-summary call (lines 550-564) |
| `src/pages/MeetingMode.tsx` | Add `ai-summarize-session` + `slack-post-summary` calls after session completion |
| `supabase/functions/ai-summarize-session/index.ts` | Remove Slack posting code (keep AI summary generation only) |
| `supabase/functions/daily-summary-cron/index.ts` | **New** -- end-of-day cron function that aggregates daily activity and posts digest |
| `supabase/config.toml` | Add `daily-summary-cron` with `verify_jwt = false` |
| Database | Enable pg_cron + pg_net, create scheduled job |

