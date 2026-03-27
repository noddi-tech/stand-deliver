

# Make Reclassification Survive Page Navigation

## Problem
The reclassification loop runs client-side inside a `useMutation` hook. Navigating away unmounts the component and kills the process mid-batch.

## Approach: Move to Edge Function

Move the batch loop server-side so the browser fires one request and the edge function processes all items independently.

### 1. Create `reclassify-contributions` Edge Function
- Accepts `team_id`, `mode` (incremental/full), `since` (ISO date)
- Fetches all external_activity + commitments server-side
- Filters already-classified items in incremental mode
- Calls `ai-classify-contributions` for each batch (reuse existing classification logic)
- Writes progress to a new `reclassification_jobs` table (id, team_id, status, processed, total, classified, error_message, created_at, updated_at)
- Updates row as it progresses; sets status to `complete` or `failed` at the end

### 2. Create `reclassification_jobs` table (migration)
- Columns: `id` (uuid), `team_id` (uuid), `status` (text: pending/running/complete/failed), `processed` (int), `total` (int), `classified` (int), `error_message` (text), `created_at`, `updated_at`
- RLS: SELECT for team members; INSERT/UPDATE via service_role only (same pattern as focus_retrospectives)

### 3. Update `useReclassifyContributions` hook
- `mutate` now calls the edge function (fire-and-forget), which returns `{ job_id }`
- Subscribe to `reclassification_jobs` via Supabase Realtime for progress updates
- Progress state derived from the DB row, so re-entering the page picks up an in-progress job
- On mount, check for any `running` job for this team and resume showing progress

### 4. Update FocusTab + Dashboard + Analytics
- Progress banner reads from the hook's Realtime-backed state (no change needed if hook API stays the same)
- On page load, if a job is `running`, show the progress bar immediately

### Files
| File | Action |
|------|--------|
| Migration: `reclassification_jobs` table | Create |
| `supabase/functions/reclassify-contributions/index.ts` | Create |
| `supabase/config.toml` | Edit (add function) |
| `src/hooks/useTeamFocus.ts` | Edit (rewrite `useReclassifyContributions`) |
| `src/integrations/supabase/types.ts` | Auto-updated |

### Implementation Order
1. Migration for `reclassification_jobs` table
2. Edge function `reclassify-contributions`
3. Rewrite hook with Realtime subscription
4. Test end-to-end: trigger reclassify, navigate away, come back, confirm progress resumes

