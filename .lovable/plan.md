

# Calendar Week Alignment + Monday Morning Fallback

## Problem

Fix 1 (calendar week boundaries) creates the same Monday-morning empty state for the Dashboard Member Breakdown that Fix 2 solves for awards. Both `useEnrichedAnalytics` and `useWeeklyAwards` need the same fallback pattern.

## Changes

### 1. `src/hooks/useEnrichedAnalytics.ts` — calendar week + fallback

**Line 67**: Replace rolling window with calendar week when `periodDays === 7`:

```typescript
const mondayStart = startOfWeek(new Date(), { weekStartsOn: 1 });
const sinceDate = periodDays === 7
  ? mondayStart.toISOString()
  : subDays(new Date(), periodDays).toISOString();
```

After computing `members` (line ~206), add fallback check for the week period:

```typescript
// If current calendar week has no data, fall back to last week
let displayLabel = "This Week";
if (periodDays === 7 && members.every(m => !m.hasVIS && m.commitCount === 0)) {
  // Re-query with last Monday–Sunday window
  const lastMonday = subDays(mondayStart, 7);
  // ... re-run the same queries with lastMonday.toISOString() as sinceDate
  displayLabel = "Last Week";
}
```

To avoid duplicating the entire query body, restructure the `queryFn` to extract the data-fetching logic into an inner helper that takes `sinceDate` as a parameter. Call it first with current week; if empty and `periodDays === 7`, call again with last week's start. This keeps the code DRY.

Return `displayLabel` alongside the existing `EnrichedMetrics`:

```typescript
return { ...metrics, displayLabel } as EnrichedMetrics & { displayLabel: string };
```

Add `displayLabel` to the `EnrichedMetrics` interface (or return as a separate field).

### 2. `src/hooks/useWeeklyAwards.ts` — fallback to last week

After line 154, add the fallback check:

```typescript
const hasEnoughData = thisWeekMembers.length > 0;
const displayLabel = hasEnoughData ? "This Week" : "Last Week";

if (!hasEnoughData) {
  // Recompute awards from lastWeekMap instead
  const lastWeekMembers = Array.from(lastWeekMap.values())
    .filter(m => m.commitCount + m.reviewsGiven + m.commitmentsCompleted > 0);
  // Use lastWeekMembers for MVP/Hero/Momentum computation below
}
```

Return `{ awards, displayLabel }` — the return type already has `awards`, just add `displayLabel`.

### 3. `src/pages/TeamInsights.tsx` — use dynamic label

**Line 69-71**: Replace hardcoded "This Week's Awards" with:

```typescript
{awardsData?.displayLabel || "This Week"}'s Awards
```

And the badge on line 71:

```typescript
<Badge ...>{awardsData?.displayLabel || "This week"}</Badge>
```

### 4. `src/components/team/MemberBreakdown.tsx` — date range subtitle

Add a date range subtitle next to the period selector. When `useEnrichedAnalytics` returns `displayLabel: "Last Week"`, show "Last Week" instead of "This Week" in the period button area. Pass `displayLabel` through from Dashboard → MemberBreakdown as a new optional prop.

Also add formatted date range (e.g., "Mar 24 – Mar 30") as muted text next to the heading using `format(periodStart, "MMM d")` – `format(periodEnd, "MMM d")`.

### 5. `src/pages/Dashboard.tsx` — pass displayLabel

Read `displayLabel` from the enriched hook result and pass to `MemberBreakdown`:

```typescript
const { data: enriched } = useEnrichedTeamMetrics(teamId, PERIOD_DAYS[breakdownPeriod]);
// enriched now includes displayLabel
```

Pass as prop: `<MemberBreakdown ... displayLabel={enriched?.displayLabel} />`

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useEnrichedAnalytics.ts` | Calendar week start for 7d; fallback to last week if empty; return `displayLabel` |
| `src/hooks/useWeeklyAwards.ts` | Fallback to last week awards if current week empty; return `displayLabel` |
| `src/pages/TeamInsights.tsx` | Use dynamic `displayLabel` for awards heading |
| `src/components/team/MemberBreakdown.tsx` | Accept `displayLabel` prop; show date range subtitle |
| `src/pages/Dashboard.tsx` | Pass `displayLabel` from enriched hook to MemberBreakdown |

