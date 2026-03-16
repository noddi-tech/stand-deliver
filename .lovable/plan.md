

# VIS Implementation — Ready to Build

## Confirmed decisions from feedback

1. **Scoring formula duplication**: Use copy-with-comment approach (`supabase/functions/_shared/scoring.ts` + `src/lib/scoring.ts`). Add a unit test in `src/test/scoring.test.ts` that imports the client copy and asserts outputs for a fixed set of inputs. If the formula changes, CI catches drift. Monorepo `packages/` dir is overkill for ~20 lines right now.

2. **Old classifyCommits preserved during inspection**: The existing `classifyCommits` block (lines ~880-917 in `github-sync-activity`) writes `work_type` into `external_activity.metadata`. The new classification call writes to `impact_classifications` table. Both run in parallel during Step 5. Old code is only removed in Step 6 (frontend swap). This gives side-by-side comparison data.

3. **Standup classification in Phase 2**: Wired into `MyStandup.tsx` after line ~675 (after `is_acknowledged` update, before `toast.success`). Fire-and-forget call with the standup response + newly inserted commitments.

---

## Implementation sequence (this session)

### 1. Database migration

Two tables: `impact_classifications` and `weekly_vis_scores` with indexes and RLS policies as specified in the approved plan. No FK constraint on `activity_id` (supports multiple source types). Unique index on `(activity_id, source_type)` for upsert.

### 2. Shared scoring module

- `supabase/functions/_shared/scoring.ts` — canonical `computeImpactScore()` function
- `src/lib/scoring.ts` — client copy with `// CANONICAL VERSION: supabase/functions/_shared/scoring.ts` comment
- `src/test/scoring.test.ts` — drift-detection test with fixed inputs/outputs

### 3. Rewrite `ai-classify-contributions`

- Per-item classification with the 3-dimension prompt
- Injects active `team_focus` items with IDs
- Computes deterministic `impact_score` via shared scoring function
- Upserts into `impact_classifications` with `ON CONFLICT (activity_id, source_type) DO UPDATE`
- Accepts batches up to 20 items

### 4. Wire into `github-sync-activity`

- After badge detection block (line ~956), before cron continuation (line ~958)
- Collect all `external_activity` IDs that were upserted during this run
- Call `ai-classify-contributions` in batches of 20
- Graceful: log and continue on failure
- Old `classifyCommits` block stays untouched

### 5. Wire into `clickup-sync-activity`

- After each task upsert, immediately call `ai-classify-contributions` with that single item
- Same graceful fallback

### 6. Wire into `MyStandup.tsx`

- After line ~675 (after auto-acknowledge), fire-and-forget `supabase.functions.invoke('ai-classify-contributions', ...)` with the standup response and commitments
- No await — doesn't block the submit flow

### 7. Create `compute-weekly-vis` edge function

- Aggregation cron: sum scores, normalize to team median, compute delivery/multiplier/focus components
- Upsert into `weekly_vis_scores`
- Add to `supabase/config.toml`

### 8. `useWeeklyVIS` hook

- Past weeks: read from `weekly_vis_scores`
- Current week: query `impact_classifications` created this week, run client-side formula
- Returns `{ visTotal, breakdown, isEstimate }`

### 9. Config + cron setup

- Add `compute-weekly-vis` to `supabase/config.toml` with `verify_jwt = false`
- Schedule Sunday midnight cron via `pg_cron` insert

---

## Files created/modified

| File | Action |
|---|---|
| Migration SQL | Create 2 tables + indexes + RLS |
| `supabase/functions/_shared/scoring.ts` | New — canonical scoring formula |
| `src/lib/scoring.ts` | New — client copy of scoring formula |
| `src/test/scoring.test.ts` | New — drift-detection test |
| `supabase/functions/ai-classify-contributions/index.ts` | Rewrite |
| `supabase/functions/compute-weekly-vis/index.ts` | New |
| `supabase/functions/github-sync-activity/index.ts` | Modify — add classification trigger after line ~956 |
| `supabase/functions/clickup-sync-activity/index.ts` | Modify — add classification trigger after upsert |
| `src/pages/MyStandup.tsx` | Modify — fire-and-forget classification after submit |
| `src/hooks/useWeeklyVIS.ts` | New |
| `supabase/config.toml` | Add `compute-weekly-vis` entry |

