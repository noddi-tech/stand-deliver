

# VIS Unified Scoring Overhaul

## Status: Steps 1-7 COMPLETE ✅

## What Changed

Replaced the dual normalization system (linear for weekly cron/hook, log-scale for analytics/awards/digest) with a single absolute-baseline formula. Every view now shows the same VIS number.

### Formula

```
normalizedImpact = clamp(log10(rawImpact + 1) / log10(referenceBaseline + 1) × 60, 0, 100)
VIS = normalizedImpact × 0.40 + deliveryScore × 0.30 + multiplierScore × 0.15 + focusRatio × 0.15
```

### Files Changed

| Step | File | Change |
|------|------|--------|
| 1 | Migration | Created `vis_config` table, auto-calibrated baseline from 30-day data |
| 2 | `supabase/functions/_shared/scoring.ts` | New `computeVISTotal(rawImpact, baseline)` + `computeNormalizedImpact` helper |
| 2 | `src/lib/scoring.ts` | Mirror of canonical |
| 2 | `src/test/scoring.test.ts` | 18 tests updated for new signature |
| 3 | `supabase/functions/compute-weekly-vis/index.ts` | Reads baseline from `vis_config`, removed median calculation |
| 4 | `src/hooks/useWeeklyVIS.ts` | Reads baseline from `vis_config`, removed all-team fetch for median |
| 5 | `src/hooks/useEnrichedAnalytics.ts` | Replaced log-scale median normalization with `computeNormalizedImpact` |
| 6 | `src/hooks/useWeeklyAwards.ts` | Replaced `logScaleNormalize` with `computeNormalizedImpact` |
| 7 | `supabase/functions/ai-weekly-digest/index.ts` | Replaced `logScaleNormalize` with absolute-baseline normalization |

## Remaining (Step 9 — independently shippable)

- 9a: Weighted Delivery Score (by impact tier)
- 9b: Review Depth Multiplier
- 9c: Work Type Macro-Categories
- 9d: Richer Team Insights Celebrations
- 9e: VIS Sparkline on Member Cards
