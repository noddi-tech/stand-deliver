

# Fix VIS Consistency Across All Views + Add Time Filter to Member Breakdown

## Problem

Three different numbers shown for the same person:
- **Member Breakdown**: Joachim = **54** (log-scale normalized impact from `useEnrichedTeamMetrics`)
- **Team Insights awards**: Joachim = **79**/100 (linear normalized impact from `useWeeklyAwards`)
- **Weekly Digest awards**: Anders = **1597** (old frozen JSONB in DB — never refreshed after edge function fix)

Root cause: Three different normalization methods are used across the codebase:
1. `useEnrichedTeamMetrics` (Member Breakdown): **log-scale** — `log10(raw+1) / log10(median+1) * 50`, clamped 5-100
2. `useWeeklyAwards` (Team Insights): **linear** — `raw / median * 50`, clamped 0-100
3. `ai-weekly-digest` edge function: same linear normalization (recently fixed but DB has stale row)

## Fix: Unify on log-scale normalization and label as "VIS"

The log-scale method is better because it compresses extreme ranges — a member with 5x the median doesn't get capped at 100 while everyone else clusters near 50.

### Changes

| File | Change |
|---|---|
| `src/hooks/useWeeklyAwards.ts` | Replace linear normalization (`raw / median * 50`) with log-scale (`log10(raw+1) / log10(median+1) * 50`, floor 5). Change stat label to `VIS: X/100`. |
| `supabase/functions/ai-weekly-digest/index.ts` | Same: replace `normalizeImpactScores` with log-scale. Change stat label to `VIS: X/100`. |
| `src/pages/WeeklyDigest.tsx` | Fix `startOfWeek` consistency — `getCurrentWeekStart()` uses `weekStartsOn: 1` (Monday) but `useWeeklyAwards` uses default (Sunday). Align both to Monday so live data overrides frozen data for current week. |

### Time filter for Member Breakdown

Add a period selector (This Week / This Month / This Quarter / This Year) to the Member Breakdown card. Default: "This Week".

| File | Change |
|---|---|
| `src/components/team/MemberBreakdown.tsx` | Add period selector UI (pill buttons). Pass `period` to parent via callback or manage locally. |
| `src/hooks/useEnrichedAnalytics.ts` | Accept optional `daysBack` parameter (default 7). Use it instead of hardcoded 30. |
| `src/hooks/useMemberBadgeCounts.ts` | Accept optional `daysBack` parameter (default 7). |
| `src/hooks/useTeamSummary.ts` | Already has `period` param — wire it through. |
| `src/pages/Dashboard.tsx` | Pass period state to `MemberBreakdown` and dependent hooks. |
| `src/pages/Analytics.tsx` | Same. |

Period mapping: This Week = 7, This Month = 30, This Quarter = 90, This Year = 365.

