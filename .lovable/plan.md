

# Fix Reclassification Progress Showing 0/0

## Problem

The progress banner shows "0/0" because:

1. The edge function creates the job row with `total: 0`, then processes in the background. There's a gap between job creation and when `total` is updated after fetching all items.
2. The UI shows the banner immediately when status is "running" but `total` hasn't been populated yet.
3. The `scheduleReclassify` debounce fires automatically on focus item changes — there's no manual "Re-classify" button to trigger it on demand.

## Fix

### 1. Show indeterminate progress when total is 0

In `FocusTab.tsx`, when `total === 0` and status is `running`, show "Preparing..." with an indeterminate progress bar instead of "0/0". Only show the count once `total > 0`.

### 2. Add a manual "Re-classify Activities" button

Add a button (e.g. next to "Add Focus Area" / "Suggest with AI") that lets leads manually trigger reclassification without editing a focus area. This addresses your original question about retriggering.

### 3. Improve edge function: set total before responding

In `reclassify-contributions/index.ts`, move the item-fetching and total calculation BEFORE returning the response. The background processing loop starts after, but the job row already has the correct `total`. This eliminates the 0/0 window.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/reclassify-contributions/index.ts` | Compute total before responding, update job row with total before starting batch loop |
| `src/components/settings/FocusTab.tsx` | Show "Preparing..." when total=0, add manual "Re-classify" button |

