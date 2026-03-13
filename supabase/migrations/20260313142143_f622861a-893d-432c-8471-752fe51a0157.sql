
-- Fix: Change unique index to include team_id and member_id so per-member activity is preserved
DROP INDEX IF EXISTS idx_external_activity_dedup;
CREATE UNIQUE INDEX idx_external_activity_dedup ON public.external_activity (team_id, member_id, external_id, activity_type, source);
