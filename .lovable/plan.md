

# Backfill Activity Badges + Badge Distribution on MemberBreakdown

## Task 1: Backfill Edge Function

Create a new edge function `backfill-activity-badges` that:

1. Fetches all `external_activity` rows that don't yet have a matching `activity_badges` row (LEFT JOIN where activity_badges.id IS NULL)
2. Runs `resolveActivityBadge()` from `_shared/activity-badges.ts` on each row
3. Calls `upsertBadge()` for each, processing in batches of 100
4. Returns a count of badges created

This is a one-time admin function. No RLS bypass needed since it uses the service role key already available in edge functions. Invoked manually via Supabase dashboard or curl.

**File**: `supabase/functions/backfill-activity-badges/index.ts`

## Task 2: Badge Distribution on MemberBreakdown Cards

### Data flow

The `MemberBreakdown` component already receives `enrichedMembers` which has `memberId`. We need to fetch badge counts per member for the current period.

**New hook**: `src/hooks/useMemberBadgeCounts.ts`
- Takes `teamId` and an array of `memberIds`
- Queries `activity_badges` joined with `external_activity` (to get `member_id` and filter by date range) 
- Actually simpler: query `activity_badges` table joined to `external_activity` on `activity_id` to get `member_id`, grouped by `member_id` and `badge_key`, filtered to last 7 days
- Returns `Record<string, Record<string, number>>` — memberId → badgeKey → count

**Alternative (simpler)**: Query `external_activity` for the team in the last 7 days to get activity IDs + member IDs, then batch-fetch `activity_badges` for those IDs, and aggregate client-side. This avoids a complex join and reuses existing patterns.

### MemberBreakdown changes

Add a new prop `badgeCounts?: Record<string, Record<string, number>>` to `MemberBreakdownProps`.

On each member card, between the progress bar and the highlight quote, render a compact badge distribution line like:
```
🚀×12  🐛×8  🔧×3
```

Only show the top 4 badge types (sorted by count descending) to keep cards compact. Use `ALL_BADGES` from `src/lib/activity-badges.ts` for emoji lookup.

### Wiring in Dashboard.tsx and Analytics.tsx

Both pages already render `<MemberBreakdown>`. Add the `useMemberBadgeCounts` hook call and pass the result as the new prop.

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/backfill-activity-badges/index.ts` | Create — one-time backfill function |
| `src/hooks/useMemberBadgeCounts.ts` | Create — fetch badge counts per member |
| `src/components/team/MemberBreakdown.tsx` | Add badge distribution row to each card |
| `src/pages/Dashboard.tsx` | Wire `useMemberBadgeCounts` hook, pass to MemberBreakdown |
| `src/pages/Analytics.tsx` | Same wiring |

