

# Fix Member Breakdown for Non-Week Periods

## Problem
Two issues cause the Member Breakdown to appear stale or empty for Month/Quarter/Year:

1. **1000-row limit**: The `ai-team-summary` edge function fetches `external_activity` without pagination (line 41). For longer periods, this silently truncates data, producing misleading or empty highlights.
2. **AI prompt says "days" not period name**: The prompt (line 175) says `${days}-day team data` but never tells the AI "this month" or "this quarter", so highlights always use week-centric language.

## Changes

### 1. Edge function: paginate external_activity + add period label
**File:** `supabase/functions/ai-team-summary/index.ts`

- Add a `fetchAllRows` helper (same pattern as `useTeamMemberStats`) to paginate the `external_activity` query
- Map period days to a human label ("this week", "this month", "this quarter", "this year") and inject it into the AI prompt so highlights use correct phrasing

### 2. Deploy
Redeploy `ai-team-summary` edge function.

## Technical detail

```text
Current (line 41):
  supabase.from("external_activity").select("*")...  // max 1000 rows

Fixed:
  fetchAllRows(offset => supabase...range(offset, offset+999))  // all rows

Prompt change (line 175):
  "Analyze the following data for {periodLabel} ({days} days)..."
  + "Use the phrase '{periodLabel}' when referring to the time period."
```

| File | Change |
|------|--------|
| `supabase/functions/ai-team-summary/index.ts` | Paginate external_activity, add period label to prompt |

