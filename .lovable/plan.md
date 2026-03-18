

# Fix: Member Breakdown Data Doesn't Scale With Period

## Root Causes

Three bugs cause longer periods to show less or identical data:

### 1. Supabase 1000-row default limit truncates longer periods
`useTeamMemberStats` queries `external_activity` without `.limit()` or pagination. Supabase returns at most 1000 rows by default. For "This Week" there are ~200 activities so all are returned. For "This Quarter" there are ~2000+, but only 1000 come back — and those 1000 are arbitrary, so per-member counts can actually be **lower** than the weekly view.

### 2. VIS/enriched metrics are hardcoded to 30 days
`useEnrichedTeamMetrics` always queries the last 30 days (`subDays(new Date(), 30)`). It ignores the period selector entirely, so VIS scores stay the same regardless of week/month/quarter/year.

### 3. AI highlights are hardcoded to 7 days
`useTeamSummary(teamId)` is called without passing the period. The edge function defaults to `"7d"`. The quoted text and sentiment badges ("Strong week", "Steady") never change.

## Plan

### 1. Paginate `external_activity` in `useTeamMemberStats`
**File:** `src/hooks/useTeamMemberStats.ts`

Replace the single query with a paginated loop using `.range(offset, offset+999)` to fetch all rows for the period. Same pattern already used in `useReclassifyContributions`.

### 2. Make `useEnrichedTeamMetrics` period-aware
**File:** `src/hooks/useEnrichedAnalytics.ts`

- Add `periodDays` parameter (default 30 for backward compat)
- Replace hardcoded `subDays(new Date(), 30)` with `subDays(new Date(), periodDays)`
- Add pagination for the `external_activity` and `impact_classifications` queries (same 1000-row limit issue)
- Include `periodDays` in the query key

### 3. Pass period to enriched metrics from Dashboard & Analytics
**Files:** `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`

- Change `useEnrichedTeamMetrics(teamId)` to `useEnrichedTeamMetrics(teamId, PERIOD_DAYS[breakdownPeriod])`

### 4. Make AI highlights period-aware
**Files:** `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`

- Pass period string to `useTeamSummary`: map `breakdownPeriod` to `"7d"` / `"30d"` / `"90d"` / `"365d"`
- Include period in the query key (already done — `useTeamSummary` takes `period` as second arg)

## Files to change

| File | Change |
|------|--------|
| `src/hooks/useTeamMemberStats.ts` | Paginate external_activity fetch |
| `src/hooks/useEnrichedAnalytics.ts` | Add `periodDays` param, paginate queries |
| `src/pages/Dashboard.tsx` | Pass period to enriched metrics + team summary |
| `src/pages/Analytics.tsx` | Same |

## Result
- Switching to "This Quarter" shows cumulative data that is always ≥ "This Week"
- VIS scores reflect the selected period
- AI highlights regenerate per period (cached separately per period string)

