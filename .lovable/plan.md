

# Fix: Edge function awards use raw impact instead of normalized VIS

## Problem

The `ai-weekly-digest` edge function (line 284) stores `impactScore = Math.round(visScore)` where `visScore` is the **raw sum** of `impact_score` values (e.g., 1597). The client-side `useWeeklyAwards` was already fixed to normalize this to 0-100 using team median, but the edge function was never updated — so stored/frozen digests still show raw numbers.

This affects:
- Weekly Digest page when showing stored (non-current-week) awards
- The stat line says "VIS: 1597" instead of "Impact: 79/100"

## Fix

**`supabase/functions/ai-weekly-digest/index.ts`** — Add the same team-median normalization after `populateScores()`:

1. After line 289 (after both `populateScores` calls), compute `teamMedian` from raw VIS scores in `thisWeekVIS` (same logic as client hook: sort values, pick middle, fallback to 1).
2. Loop through `thisWeekScores` and normalize: `impactScore = min(100, round((raw / teamMedian) * 50))`.
3. Do the same for `lastWeekScores` using `lastWeekVIS` median (needed for momentum calculation).
4. Update the stat line template (line 320) from `VIS: ${mvp.impactScore}` to `Impact: ${mvp.impactScore}/100`.

This is a ~15-line addition. No other files need changes — the client hook is already correct.

## Files

| File | Change |
|---|---|
| `supabase/functions/ai-weekly-digest/index.ts` | Add median normalization after `populateScores`, update stat label |

After deploying, the user should regenerate the digest to get corrected stored values.

