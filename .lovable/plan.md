

# VIS Implementation Fixes — 7 Changes

All fixes verified against current code. Here's the implementation plan:

## Fix 1: useTeamFocus.ts — Replace broken `useContributionClassification`
**Problem**: Hook invokes `ai-classify-contributions` with `{ team_id }` only — the rewritten edge function requires an `items` array and rejects the call.
**Fix**: Rewrite to read from `impact_classifications` table (last 7 days), aggregate per-member breakdowns with focus label lookups. No AI call needed — classification happens on ingest now.
- Lines 123-136 replaced entirely.

## Fix 2: ai-classify-contributions — Replace system prompt
**Problem**: Generic tier descriptions produce weak classifications. No anti-gaming rules, no vibe-coding handling, no counterfactual reasoning.
**Fix**: Replace `systemPrompt` (lines 63-88) with the full spec version covering: business-value framing, 8-person team context, vibe-coding neutrality, "when in doubt pick lower tier" rule, and explicit focus alignment anti-hallucination instruction.

## Fix 3: ai-classify-contributions — Save focus_item_id for "indirect"
**Problem**: Line 180 only keeps `focus_item_id` when `focus_alignment === "direct"`, discarding it for "indirect".
**Fix**: Change condition to `(c.focus_alignment === "direct" || c.focus_alignment === "indirect")`.

## Fix 4: compute-weekly-vis — Fix week boundary off-by-one
**Problem**: If cron fires Sunday 00:00 UTC, `dayOfWeek === 0` means `daysToLastSunday === 0`, so it scores the current incomplete week.
**Fix**: Subtract 1 day first (`yesterday`), then compute week boundaries from there. Ensures we always get the last complete Mon-Sun week.
- Lines 19-29 replaced.

## Fix 5: useWeeklyVIS — Fix mid-week normalization
**Problem**: `normalizedImpact = Math.min(100, rawImpact)` — any active person's raw impact sum exceeds 100 quickly, pinning everyone at max.
**Fix**: Fetch all team members' classifications for the week, compute team median client-side, normalize as `(rawImpact / median) * 50` — matching the server-side formula.
- Lines 112-134 replaced with median computation logic.

## Fix 6: scoring.test.ts — Merge new behavioral tests
**Problem**: The existing test file has drift-detection cases. The user's spec adds behavioral tests (critical fix > large chore, unknown enum fallbacks, etc.).
**Fix**: Append the new test cases to the existing file rather than overwriting it (the existing drift-detection tests are still valuable). The new tests add: behavioral ordering assertions, unknown-enum fallback, equal-components-at-50 check.

## Fix 7: Database migration — unclassified activities view + index
**Problem**: No way to find activities that failed classification for retry/backfill.
**Fix**: Create a view `unclassified_activities` (LEFT JOIN anti-pattern on `external_activity` vs `impact_classifications`) and an index on `impact_classifications(activity_id)` to speed up the join.

---

### Files modified
| # | File | Change |
|---|---|---|
| 1 | `src/hooks/useTeamFocus.ts` | Replace `useContributionClassification` to read from DB |
| 2 | `supabase/functions/ai-classify-contributions/index.ts` | Replace system prompt + fix focus_item_id condition |
| 3 | `supabase/functions/compute-weekly-vis/index.ts` | Fix week boundary calculation |
| 4 | `src/hooks/useWeeklyVIS.ts` | Add team median normalization |
| 5 | `src/test/scoring.test.ts` | Add behavioral test cases |
| 6 | New migration | Create view + index |

