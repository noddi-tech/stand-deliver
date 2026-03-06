

## Problem

The Schedule tab in Settings is a placeholder — it just says "Schedule settings will be available here." The schedule (days, time, timezone, timer duration) is set during onboarding and saved to the `teams` table, but there's no way to view or change it afterwards.

## Plan

### Build out `ScheduleTab.tsx`

Replicate the same schedule UI from the onboarding step 2 (days toggle buttons, time input, timezone select, timer slider) but as an editable settings form that:

1. **Loads current values** from the `teams` table using the user's active team (via `team_members` lookup)
2. **Displays the schedule** with the same day-pill toggles, time picker, timezone dropdown, and timer-per-person slider used in onboarding
3. **Saves changes** back to the `teams` table on a "Save" button click with a success toast

### Fields

| Field | Column | UI Control |
|-------|--------|------------|
| Standup days | `standup_days` (text array) | Day pill toggles (Mon-Sun) |
| Standup time | `standup_time` (time string) | Time input |
| Timezone | `standup_timezone` | Searchable select with system timezones |
| Timer per person | `timer_seconds_per_person` | Slider (30s-300s) with label |

### Files Changed

| File | Change |
|------|--------|
| `src/components/settings/ScheduleTab.tsx` | Full implementation — fetch team schedule, render editable form, save updates |

No new database changes needed — the columns already exist on the `teams` table from onboarding.

