

# Hide Standup Button on Non-Scheduled Days

## Problem
The Dashboard always shows "Start Today's Standup" when no session exists — it doesn't check the team's `standup_days` schedule. On days with no standup scheduled (e.g. Sunday), the button still appears.

## Solution
In `src/pages/Dashboard.tsx`, check whether today is a scheduled standup day before rendering the standup button. The `useAttentionItems` hook already has this exact logic — compute the current day code using the team's `standup_timezone` and check against `standup_days`.

## Changes

**File: `src/pages/Dashboard.tsx`**

1. Fetch the team's schedule data (already available via `useUserTeam` → `team` object, but need `standup_days` and `standup_timezone` from the `teams` table). Query the `teams` table for these fields using `teamId`.

2. Add a `isStandupDay` check:
```
const dayMap = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const teamNow = new Date(new Date().toLocaleString("en-US", { timeZone: teamSchedule.standup_timezone || "UTC" }));
const todayCode = dayMap[teamNow.getDay()];
const isStandupDay = teamSchedule.standup_days?.includes(todayCode);
```

3. In `standupButton()`, when status is `"no_session"`, return `null` if `!isStandupDay` instead of showing the Start/Skip buttons.

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Query team schedule; hide standup button on non-standup days |

