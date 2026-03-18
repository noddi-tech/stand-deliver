

# Make Member Breakdown Update Continuously Across Periods

## Problem
The Member Breakdown looks like it supports week/month/quarter/year periods, but:
1. **Core stats (commitments, participation, activity) always show 7 days** -- they come from `ai-team-summary` which is hardcoded to `period="7d"` and cached for 30 minutes
2. **Only badge counts respond to the period selector** (via `useMemberBadgeCounts`)
3. **No real-time updates** -- the `useRealtimeInvalidation` hook doesn't invalidate `team-summary`
4. Switching periods gives a false impression of different data when it's the same 7-day snapshot

## Plan

### 1. Create a new client-side hook: `useTeamMemberStats`
**File:** `src/hooks/useTeamMemberStats.ts` (new)

Replace the AI-generated `memberStats` with a direct database query that:
- Accepts `teamId` and `periodDays` parameters
- Queries `commitments`, `blockers`, `standup_sessions`/`standup_responses`, and `external_activity` filtered by the selected period
- Computes the same `MemberStat` shape (completion rate, participation rate, activity counts) purely from DB data
- Uses a 30-second `staleTime` so it stays fresh
- No AI call needed -- these are straightforward aggregations

This makes the member stats **period-aware** and **fast** (no AI latency).

### 2. Keep AI summary for highlights only
**Files:** `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`

- Use the new `useTeamMemberStats(teamId, PERIOD_DAYS[breakdownPeriod])` for the `memberStats` prop
- Keep `useTeamSummary` only for `analysis.memberHighlights` and `analysis.teamSummary` (the qualitative AI insights)
- Pass `periodDays` to the hook so switching "This Week" / "This Month" / "This Quarter" / "This Year" actually changes the data

### 3. Add realtime invalidation for member stats
**File:** `src/hooks/useRealtimeInvalidation.ts`

Add invalidation of the new `team-member-stats` query key when:
- New `external_activity` rows arrive
- `standup_responses` are inserted
- `commitments` or `blockers` change (via `impact_classifications` channel already exists)

### 4. No schema changes needed
All data already exists in the DB with proper timestamps. The hook just queries with a dynamic date filter.

## Files to Change
| File | Change |
|------|--------|
| `src/hooks/useTeamMemberStats.ts` | New hook: period-aware member stats from DB |
| `src/pages/Dashboard.tsx` | Use new hook for `memberStats`, keep AI for highlights |
| `src/pages/Analytics.tsx` | Same as Dashboard |
| `src/hooks/useRealtimeInvalidation.ts` | Invalidate `team-member-stats` on relevant changes |

## Result
- Period selector actually changes the data (7d / 30d / 90d / 365d)
- Stats update within 30 seconds of new activity (commits, standups, etc.)
- Realtime channel pushes instant cache invalidation
- No extra AI calls or DB migrations needed

