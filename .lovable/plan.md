

# Update MemberBreakdown to Show VIS Impact Scores

## What's happening now

The `MemberBreakdown` component (line 146) displays `em?.codeImpactScore` which comes from `useEnrichedAnalytics.ts` → `computeCodeImpact()` — the old line-count-based formula (`sqrt(totalChanged) * 2 + filesChanged * 1.5`). This was intentionally preserved during the VIS backend rollout (Step 5 inspection period).

Since the backend is now live and writing to `impact_classifications`, we can wire the new scores into the member breakdown.

## What to change

### 1. Add VIS scores to the MemberBreakdown data flow

The simplest approach: query `impact_classifications` for the current week per member and sum `impact_score` — this gives the new VIS-based impact number. This can be done inside `useEnrichedAnalytics.ts` by replacing the `computeCodeImpact` calculation with a sum from the `impact_classifications` table, or by adding a lightweight query alongside the existing enriched data.

**Preferred approach**: Add a new query in `useEnrichedAnalytics.ts` that fetches the current week's `impact_classifications` grouped by `member_id`, sums `impact_score`, and populates `codeImpactScore` with the VIS value instead of the old formula. The old `computeCodeImpact` function stays for backward compatibility on trend charts (which we'll swap in Step 6).

### 2. Changes to `useEnrichedAnalytics.ts`

- Inside the `useEnrichedTeamMetrics` query function, add a query to `impact_classifications` for the last 30 days grouped by member
- Sum `impact_score` per member → use as `codeImpactScore`
- Fall back to old `computeCodeImpact` if no classifications exist (graceful degradation)

### 3. Changes to `MemberBreakdown.tsx`

- Update the label from `"Impact"` / `"Activity"` to always show `"VIS Impact"` when VIS data is available
- No structural changes needed — the component already reads `em?.codeImpactScore`

### Files modified

| File | Change |
|---|---|
| `src/hooks/useEnrichedAnalytics.ts` | Replace `codeImpactScore` computation with `impact_classifications` sum, fallback to old formula |
| `src/components/team/MemberBreakdown.tsx` | Update label to reflect VIS scoring |

