

# Optimize Focus Alignment Refresh + Add Realtime Updates

## Bug Fix (Critical)
Line 289 in `useTeamFocus.ts` selects `id, label` from `team_focus` but line 295 references `f.title` — which is `undefined`. This means the `focusLabelMap` is empty and everything gets classified as "Unaligned". Fix: change the select to `id, title`.

## Changes

### 1. Fix focusLabelMap query (`src/hooks/useTeamFocus.ts`, line 289)
Change `.select("id, label")` to `.select("id, title")` so `f.title` resolves correctly.

### 2. Optimize reclassify to skip already-classified items (`src/hooks/useTeamFocus.ts`)
Before sending batches to the AI, fetch existing `impact_classifications` for the same time window and filter out items that already have a classification. This reduces the batch from potentially 60+ items down to only new/unclassified ones, cutting refresh time from 30-45s to under 10s in most cases.

### 3. Add Supabase Realtime subscriptions for dashboard auto-refresh
Create a new hook `useRealtimeInvalidation(teamId)` that subscribes to Postgres changes on:
- `external_activity` (INSERT) — invalidates activity feed + contribution classification
- `impact_classifications` (INSERT/UPDATE) — invalidates focus alignment
- `standup_responses` (INSERT) — invalidates team metrics + attention items

Use in `Dashboard.tsx` to auto-invalidate React Query caches when new data arrives, eliminating the need for manual refresh or short polling.

### 4. Reduce staleTime on key queries
- `useContributionClassification`: 5min → 60s (reads stored data, cheap query)
- `useTeamMetrics`: 30s already, keep as-is
- `useRecentActivity`: check current value, reduce if >60s

### Files
- `src/hooks/useTeamFocus.ts` — fix select bug, add skip-classified logic
- `src/hooks/useRealtimeInvalidation.ts` — new hook for Supabase Realtime subscriptions
- `src/pages/Dashboard.tsx` — wire up realtime hook

