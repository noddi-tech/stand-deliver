
Yes — based on the current code and DB state, this job is very likely stuck at 320.

## Diagnosis
- Latest `reclassification_jobs` row is still `running` at `processed=320/1985` with no updates since `10:03`.
- In `reclassify-contributions`, the continuation handoff is still effectively fire-and-forget:
  - `selfInvoke(...)` is called but **not awaited** in both initial and continuation paths.
  - The function then returns immediately, so runtime shutdown can kill the handoff request before the next invocation starts.
- That exactly matches the symptom: first chunk runs, then chain stops.

## Implementation Plan

### 1) Make continuation handoff reliable (server-side)
**File:** `supabase/functions/reclassify-contributions/index.ts`
- Change both handoff calls to `await selfInvoke(...)` before returning the response.
- If handoff fails, explicitly update the job row:
  - `status = 'failed'`
  - `error_message = 'Failed to schedule next chunk: ...'`
  - `updated_at = now()`
- Add explicit logs around handoff start/success/failure with `job_id` and `offset` so stalls are diagnosable.

### 2) Prevent indefinite “running” UI state
**Files:** `src/hooks/useTeamFocus.ts`, `src/components/settings/FocusTab.tsx`
- In the hook, include `updated_at` in the realtime payload and mount query.
- If a job is `running` but hasn’t updated for a threshold (e.g. 2–3 minutes), surface local `error`/`stalled` state.
- In FocusTab, show a clear stalled message (“Sync stalled, please retry”) instead of endless spinner.

### 3) Recovery behavior
**File:** `supabase/functions/reclassify-contributions/index.ts`
- Keep existing “supersede stale running jobs” behavior on new starts.
- Ensure retriggering from “Re-classify” cleanly marks old stuck job failed and starts a fresh one.

## Validation Plan (end-to-end)
1. Trigger **Re-classify (full)** from Focus settings.
2. Confirm progress moves past **320** and continues in multiple jumps (e.g. 320→640→…).
3. Confirm job eventually reaches `complete`.
4. Navigate away and back during run; verify progress resumes from DB state.
5. Simulate handoff failure (temporary bad URL or forced throw) and confirm job becomes `failed` with visible retry UX.
