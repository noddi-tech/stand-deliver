

# Fix: "Needs Attention" Showing on Non-Standup Days

## Problem
The "Needs Attention" section flags everyone as "Hasn't submitted today's standup" even when today is not a configured standup day. This happens because a `standup_session` row exists for today in the database, and the hook blindly flags all members who haven't responded to it — without checking whether today is actually a standup day per the team's schedule.

## Solution
In `useAttentionItems`, fetch the team's `standup_days` and `standup_timezone`, then skip the "missing standups" logic entirely if today isn't a scheduled standup day.

## Changes

### `src/hooks/useAttentionItems.ts`

1. Add a query for the team's `standup_days` and `standup_timezone` from the `teams` table
2. Determine the current day in the team's timezone (e.g., `"wed"`)
3. Only populate `missingStandups` if today's day code is in `standup_days`
4. If it's not a standup day, return an empty `missingStandups` array regardless of whether a session exists

```text
Logic change:
  Before: if (sessionRes.data) → flag missing members
  After:  if (sessionRes.data && isStandupDay) → flag missing members
```

This is a one-file fix with no UI or schema changes.

