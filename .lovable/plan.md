

## Diagnosis: RLS Policy on `organizations` is RESTRICTIVE Instead of PERMISSIVE

The INSERT policy "Authenticated users can create orgs" on `organizations` is set as **RESTRICTIVE** (`Permissive: No`). Restrictive policies can only further narrow access — they cannot grant it. Without any PERMISSIVE INSERT policy, all inserts are denied regardless.

The same issue applies to **all tables** in this project — every single RLS policy is marked `Permissive: No` (RESTRICTIVE). This means no data operations work at all. This is a systemic issue across the schema.

### Fix

Run a migration that drops and recreates all INSERT/SELECT/UPDATE policies as PERMISSIVE. The affected tables and policies:

- `organizations` — INSERT, SELECT
- `organization_members` — INSERT, SELECT
- `teams` — INSERT, SELECT, UPDATE
- `team_members` — INSERT, SELECT
- `profiles` — SELECT, UPDATE
- `standup_sessions` — INSERT, SELECT, UPDATE
- `standup_responses` — INSERT, SELECT
- `commitments` — INSERT, SELECT, UPDATE
- `commitment_history` — INSERT, SELECT
- `blockers` — INSERT, SELECT, UPDATE
- `focus_recommendations` — INSERT, SELECT, UPDATE
- `slack_installations` — INSERT, SELECT, UPDATE
- `slack_user_mappings` — INSERT, SELECT, UPDATE
- `ai_weekly_digests` — INSERT, SELECT, UPDATE

The migration will `DROP POLICY` then `CREATE POLICY` for each, using the same `USING`/`WITH CHECK` expressions but as `PERMISSIVE` (the default) instead of `RESTRICTIVE`.

### Single migration file

`supabase/migrations/fix_rls_permissive.sql` — drops all existing policies and recreates them as permissive, preserving the same access logic.

