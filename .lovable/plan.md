

# Fix VIS Fallback to Per-Activity + Add Tooltip

## Problem 1: Per-member fallback causes score dip

Current logic (line 159-165 of `useEnrichedAnalytics.ts`):
```typescript
const visScore = visMap.get(memberId);
const hasVIS = visScore !== undefined && visScore > 0;
codeImpactScore: hasVIS ? Math.round(visScore) : computeCodeImpact(...)
```

This is all-or-nothing per member. A member with 10 activities where only 3 have been classified will show the sum of those 3 VIS scores, ignoring the other 7. Their score drops until all activities are classified.

**Fix**: Query `impact_classifications` with `activity_id` included, build a Set of classified activity IDs. Then for each member, sum VIS scores for classified activities + `computeCodeImpact` for unclassified commits. `hasVIS` becomes true when at least one classification exists (for label purposes).

### Changes to `useEnrichedAnalytics.ts`

1. Expand the `impact_classifications` query to also return `activity_id`
2. Build two maps: `visMap` (member_id → total VIS score) and `classifiedIds` (Set of activity_id strings)
3. In the per-member loop, after computing legacy `computeCodeImpact` from commits, check which commit `external_activity.id` values are NOT in `classifiedIds` and sum their legacy scores as `unclassifiedImpact`
4. Final score = `visScore + unclassifiedImpact`
5. `hasVIS` = true if `visScore > 0` (at least one classified activity)

## Problem 2: No tooltip on VIS label

### Changes to `MemberBreakdown.tsx`

Wrap the "VIS" label in a Tooltip from `@/components/ui/tooltip`:
- Tooltip text: "Value Impact Score — measures what your work accomplishes, not just code volume"
- Only shown when `hasVIS` is true
- Non-VIS labels ("Impact", "Activity") stay as plain text

### Files modified

| File | Change |
|---|---|
| `src/hooks/useEnrichedAnalytics.ts` | Per-activity fallback: blend VIS + legacy for unclassified activities |
| `src/components/team/MemberBreakdown.tsx` | Add tooltip on VIS label |

