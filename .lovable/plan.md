

# 1. Remove Mood from Standups + 2. Per-Day Standup Times

## 1. Remove Mood

Mood is referenced across these files. We'll remove the mood picker from the standup form, stop storing/displaying it, but keep the DB column (nullable, already optional) to avoid breaking historical data.

### Files to change

| File | Change |
|---|---|
| `src/pages/MyStandup.tsx` | Remove `MoodType` import, `moods` array, `mood` state, mood validation in `handleSubmit` and `requestCoachReview`, mood from `responseData`, mood from edit restore logic, and the mood picker UI |
| `src/pages/TeamFeed.tsx` | Remove `moodEmoji` map and the mood emoji display in response cards |
| `src/pages/Activity.tsx` | Remove `moodEmoji` map and mood emoji from standup activity title |
| `src/hooks/useSkipStandup.ts` | Remove `mood: null` from skip insert (column is already nullable with no default required) |
| `src/hooks/useTeamSummary.ts` | Remove `moods` from `TeamSummary` interface and any mood aggregation logic |
| `src/hooks/useTeamMetrics.ts` | Remove mood from the select query and skip detection logic (use only `yesterday_text === "Skipped"`) |
| `src/components/ai/StandupCoachCard.tsx` | Remove mood from the AI coach prompt if referenced |
| `supabase/functions/slack-collect-response/index.ts` | Remove mood from Slack response collection if present |
| `supabase/functions/ai-coach-standup/index.ts` | Remove mood from AI prompt |

No DB migration needed -- the column stays nullable and unused.

## 2. Per-Day Standup Times

Currently there's one `standup_time` (time) column on `teams`. We need per-day times. We'll store this in the existing `standup_day_modes` JSONB column by extending its structure, or add a new `standup_day_times` JSONB column for clarity.

### Approach
Add a `standup_day_times` JSONB column to `teams` with default `{}`. Structure: `{ "mon": "09:00", "wed": "10:30" }`. Days not in the map fall back to the existing `standup_time` column (backward compatible).

### Database
- Migration: `ALTER TABLE teams ADD COLUMN standup_day_times jsonb NOT NULL DEFAULT '{}'::jsonb;`

### Settings UI (`ScheduleTab.tsx`)
- Replace the single time input with per-day time inputs shown inline below each active day pill (next to the async/meeting toggle)
- Keep a "default time" input that applies to all days without a custom override
- Each day shows a small time input; clearing it reverts to the default

### MyStandup.tsx
- When checking today's schedule, also read `standup_day_times` and use the per-day time if set

### Slack reminder cron
- Read `standup_day_times` and use the per-day time for the current day when checking if it's reminder time

### Files to change

| File | Change |
|---|---|
| `supabase/migrations/*` | Add `standup_day_times` jsonb column |
| `src/components/settings/ScheduleTab.tsx` | Per-day time inputs below each day pill, default time fallback |
| `src/pages/MyStandup.tsx` | Read `standup_day_times` for schedule info |
| `supabase/functions/slack-reminder-cron/index.ts` | Use per-day time when checking reminder window |
| `src/integrations/supabase/types.ts` | Auto-updates after migration |

