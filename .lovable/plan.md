

# Auto-Trigger Re-classification When Focus Items Change

## Problem
Classifications are write-once. When a new focus item is created (e.g. "EonTyre integration"), existing activities from the past week remain classified as "unaligned" because the AI never re-evaluates them against the new focus context.

## Solution
After any focus item is added, updated, or restored, automatically re-classify recent activities (last 14 days) by calling the `ai-classify-contributions` edge function.

### Changes

**1. `src/hooks/useTeamFocus.ts`** — Add a `useReclassifyContributions` mutation:
- Fetches recent `external_activity` (last 14 days) and recent `commitments` for the team
- Maps them into the `ClassifyItem` format the edge function expects
- Calls `ai-classify-contributions` in batches of 20
- Invalidates the `contribution-classification` query cache on success
- Returns a toast-friendly result (count classified)

**2. `src/components/settings/FocusTab.tsx`** — Auto-trigger after save/restore:
- Import and call `useReclassifyContributions`
- In `handleSubmit` (after successful add/update) and `handleRestore`, fire the reclassify mutation
- Show a toast: "Re-classifying recent activity against updated focus areas..."
- Non-blocking: the mutation runs in the background; user doesn't wait

**3. `src/components/analytics/FocusAlignment.tsx`** — Wire refresh button too:
- Pass `onRefresh` through to also trigger the reclassify mutation (from Dashboard/Analytics)
- This gives users a manual re-run option as well

**4. `src/pages/Dashboard.tsx` + `src/pages/Analytics.tsx`** — Pass reclassify as `onRefresh` to `FocusAlignment`

### Edge function
No changes needed — `ai-classify-contributions` already fetches current active focus items on each call and upserts on `(activity_id, source_type)`, so re-sending the same activities will update their classifications.

### Data flow
```text
Focus item saved → useReclassifyContributions fires →
  fetch external_activity + commitments (14 days) →
  POST ai-classify-contributions (batches of 20) →
  impact_classifications upserted with new focus_item_id →
  query cache invalidated → FocusAlignment re-renders
```

4-5 files changed, no DB migration needed.

