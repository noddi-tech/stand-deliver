

# Optimize Focus Alignment: Scalable Refresh + Auto-Update on New Focus Areas

## Problems

1. **Refresh is slow**: `useReclassifyContributions` sends all unclassified items (potentially 500+) in sequential batches of 20 to an AI endpoint that takes ~10-12s per call. Total: minutes.
2. **Full reclassify impossible from UI**: When focus areas change, old classifications with wrong/null `focus_item_id` persist. The current skip-classified optimization prevents fixing them.
3. **MemberBreakdown color bug**: `focusColorMap` uses `item.label` (the tags string) as keys, but classification breakdowns use `item.title`. Colors never match.
4. **No scalable "add focus and go" flow**: Adding a new focus area triggers reclassify which is slow and provides no progress feedback. Adding several focus areas means triggering reclassify multiple times.

## Plan

### 1. Dual-mode reclassification with progress (`src/hooks/useTeamFocus.ts`)

Update `useReclassifyContributions` to accept a `mode` parameter:
- **`incremental`** (default): Current behavior -- skip items that already have an `impact_classifications` row. Fast for daily use.
- **`full`**: Skip the filter step, re-send ALL items from the window. Used when focus areas change to repair stale `focus_item_id` values.

Add progress state returned from the mutation:
- `{ processed: number, total: number, classified: number }` updated after each batch.
- Exposed via a `progress` ref or state so the UI can show "Processing 40/120...".

Paginate the `external_activity` fetch (currently limited to 1000 rows by Supabase default) using range queries to capture all data.

### 2. Focus Alignment UI: progress indicator + full rebuild action (`src/components/analytics/FocusAlignment.tsx`)

- Show a progress bar/text when reclassification is running: "Classifying 40/120 items..."
- Add a dropdown or secondary action on the refresh button:
  - Default click = incremental (fast)
  - "Rebuild all classifications" = full mode (with a confirmation toast warning about AI credit usage)
- On credit exhaustion, show inline message instead of breaking.

### 3. Fix MemberBreakdown focus color mapping (`src/components/team/MemberBreakdown.tsx`)

Change line 105 from `focusColorMap[item.label]` to `focusColorMap[item.title]` so colors match the classification breakdown keys.

### 4. FocusTab: smarter reclassify on focus changes (`src/components/settings/FocusTab.tsx`)

- When adding/updating/restoring a focus item, trigger a **full** reclassify (not incremental), since old classifications need to be re-evaluated against new focus areas.
- Show the progress state in a small banner within the FocusTab so users know it is working.
- Debounce: if the user adds multiple focus items in quick succession, only trigger one reclassify after the last mutation settles (e.g., 3-second debounce).

### 5. Wire up Analytics page (`src/pages/Analytics.tsx`)

Pass the mode parameter through to the refresh handler, same as Dashboard.

### 6. Reduce classification query filter to use source activity timestamp

In `useContributionClassification`, join or cross-reference `external_activity.occurred_at` instead of filtering by `impact_classifications.created_at`. This prevents backfilled old data from appearing in the "recent" chart.

## Files to change

| File | Change |
|------|--------|
| `src/hooks/useTeamFocus.ts` | Add `mode` param, progress state, paginated fetch, full-mode bypass |
| `src/components/analytics/FocusAlignment.tsx` | Progress indicator, dual-action refresh button |
| `src/components/team/MemberBreakdown.tsx` | Fix `item.label` -> `item.title` in color map |
| `src/components/settings/FocusTab.tsx` | Full-mode reclassify on focus changes, debounced trigger, progress banner |
| `src/pages/Dashboard.tsx` | Pass mode to refresh handler |
| `src/pages/Analytics.tsx` | Pass mode to refresh handler |

## Result

After implementation, adding new focus areas will automatically trigger a full reclassification with visible progress. The system scales to any number of focus areas because:
- The AI prompt already receives all active focus items dynamically
- The edge function validates `focus_item_id` against the current set
- Colors are assigned by index, supporting unlimited focus areas
- Incremental mode keeps daily refreshes fast; full mode is only used when focus areas change

