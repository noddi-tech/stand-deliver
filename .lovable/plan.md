

## Plan: Commitment Carry-Forward + History Tracking

### 1. Database Migration

Create a single migration with:

**`commitment_history` table:**
- `id`, `commitment_id` (FK → commitments), `session_id` (FK → standup_sessions), `old_status`, `new_status`, `note`, `changed_at`
- RLS: team members can view history via join through commitments → team_members
- RLS: insert policy for team members (needed by the trigger running as SECURITY DEFINER won't need it, but good practice)

**`carry_forward_commitments` function:**
- Takes `p_team_id` and `p_session_id`
- Updates commitments with status `active`/`in_progress` (excluding current session) to `carried`, increments `carry_count`, sets `current_session_id`
- Returns count of carried items
- `SECURITY DEFINER` so it bypasses RLS

**`log_commitment_status_change` trigger function + trigger:**
- On UPDATE of commitments, if status changed, inserts into `commitment_history`
- Trigger fires AFTER UPDATE on commitments FOR EACH ROW

### 2. Frontend Integration (`src/pages/MyStandup.tsx`)

In `handleSubmit`, after creating/finding the standup session and before fetching commitments:

1. Call `supabase.rpc('carry_forward_commitments', { p_team_id: teamId, p_session_id: sessionId })`
2. This ensures stale active/in_progress items are marked as `carried` before the user resolves them

Also update the `previousCommitments` query to include `carried` status (it already includes it in the `.in("status", [...])` filter — need to verify).

### 3. Files Changed
- **New migration**: `commitment_history` table + `carry_forward_commitments` function + status change trigger
- **`src/pages/MyStandup.tsx`**: Add RPC call after session creation, ensure `carried` is in the status filter for previous commitments

