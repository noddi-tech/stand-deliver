

# Standup Workflow Improvements

Three changes requested, each addressing a real friction point.

---

## 1. Auto-resolve commitments linked to ClickUp/GitHub

**Problem**: When a ClickUp task is marked "done" or a GitHub PR is merged, the linked commitment still shows as open — the user has to manually mark it done at the next standup.

**Solution**: During the existing sync cycles (`clickup-sync-activity` and `github-sync-activity`), after detecting a completed task/merged PR, check if any open commitment is linked to that external item and auto-resolve it.

**Implementation**:
- **`supabase/functions/clickup-sync-activity/index.ts`**: After detecting `activityType === "task_completed"`, query `commitments` where `clickup_task_id = task.id` and `status IN ('active', 'in_progress', 'carried')`. Update those to `status = 'done'`, `resolved_at = now()`, `resolution_note = 'Auto-resolved: ClickUp task completed'`.
- **`supabase/functions/github-sync-activity/index.ts`**: After detecting a merged PR (`activity_type = 'pr_merged'`), query `commitments` where `title ILIKE` the PR title (or where metadata links match) for the same member. This is fuzzier — we should add a `github_ref` column to `commitments` (nullable text) so users can explicitly link a commitment to a PR/issue. For now, auto-resolve only when an exact `external_id` match exists in `external_activity` metadata linked to a commitment.
- **DB migration**: Add `github_ref` column (nullable text) to `commitments` for future explicit linking. No schema change needed for ClickUp — `clickup_task_id` already exists.
- **UI indicator**: Show a small "Auto-resolved ✓" badge on commitments that were resolved automatically, using the `resolution_note` field.

## 2. Only show standup on scheduled days

**Problem**: The My Standup page is available every day regardless of the team's `standup_days` setting. Users shouldn't need to fill out standups on non-scheduled days.

**Solution**: On the My Standup page, fetch the team's `standup_days` and `standup_timezone`, check if today (in the team's timezone) is a scheduled day. If not, show a friendly "No standup today" state with the next scheduled date.

**Implementation**:
- **`src/pages/MyStandup.tsx`**: Fetch `standup_days` and `standup_timezone` from the team. Convert current date to team timezone. If today's day code isn't in `standup_days`, render an informational card: "No standup scheduled today. Next standup: [day]" with a link to Meeting Mode if relevant.
- The `slack-reminder-cron` already respects `standup_days` — no backend changes needed.

## 3. Per-day session type (async vs physical meeting)

**Problem**: The schedule only configures which days have standups and the time. There's no way to specify that Tuesday is a physical meeting (using Meeting Mode) and Thursday is an async/digital standup.

**Solution**: Add a per-day mode configuration to the team schedule.

**Implementation**:
- **DB migration**: Add `standup_day_modes` column to `teams` table — `jsonb` with default `{}`. Structure: `{ "tue": "physical", "thu": "async" }`. Days not in the map default to `"async"`.
- **`src/components/settings/ScheduleTab.tsx`**: Below each selected day pill, add a small toggle/select: "Async" or "Meeting". Save to `standup_day_modes`.
- **`src/pages/MyStandup.tsx`**: Check today's mode from `standup_day_modes`. If `"physical"`, redirect to Meeting Mode (or show a card: "Today is a meeting standup → Start Meeting" linking to `/meeting`).
- **`supabase/functions/slack-reminder-cron/index.ts`**: Include the day's mode in the reminder message. For physical days, adjust the Slack message to say "Today's standup is a live meeting" instead of the usual "Start Standup" button.
- **`src/pages/MeetingMode.tsx`**: When creating the session, use `session_type: "physical"` (already does this). No changes needed.

---

## Files to change

| File | Change |
|---|---|
| `supabase/migrations/*` | Add `github_ref` to `commitments`, add `standup_day_modes` jsonb to `teams` |
| `supabase/functions/clickup-sync-activity/index.ts` | Auto-resolve linked commitments on task completion |
| `supabase/functions/github-sync-activity/index.ts` | Auto-resolve linked commitments on PR merge (when `github_ref` matches) |
| `src/pages/MyStandup.tsx` | Check if today is a standup day; check day mode; show appropriate state |
| `src/components/settings/ScheduleTab.tsx` | Add per-day async/physical mode selector |
| `supabase/functions/slack-reminder-cron/index.ts` | Include day mode in reminder message |
| `src/integrations/supabase/types.ts` | Will auto-update after migration |

