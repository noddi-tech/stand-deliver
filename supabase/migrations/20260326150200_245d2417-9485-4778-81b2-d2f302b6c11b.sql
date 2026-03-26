
-- focus_gap_analyses needs INSERT policy for service_role writes but also
-- needs the auto-RLS to not block. Add a no-op INSERT policy comment:
-- INSERT/DELETE on focus_gap_analyses and focus_insights happen via service_role.
-- Adding dummy SELECT-only acknowledgment that RLS is intentionally restrictive.

-- For focus_retrospectives: add an explicit INSERT policy that only service_role can use
-- (authenticated users cannot insert). This satisfies the linter.
-- Actually, service_role bypasses RLS, so we just need to note this is intentional.
-- The linter flags tables with RLS but no INSERT policy. Let's add service-role-only comments.

-- No actual policy changes needed - the linter INFO about "RLS enabled no policy" 
-- refers to missing INSERT/UPDATE/DELETE on focus_retrospectives which is BY DESIGN.
-- Service role bypasses RLS for all writes.

-- Move pg_trgm to extensions schema (addressing WARN about extension in public)
DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Recreate the similarity function to use extensions.similarity
CREATE OR REPLACE FUNCTION public.find_similar_focus_areas(
  p_team_id uuid,
  p_search_text text,
  p_exclude_id uuid DEFAULT NULL,
  p_limit int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  label text,
  completed_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT
    tf.id, tf.title, tf.description, tf.label, tf.completed_at,
    extensions.similarity(tf.title || ' ' || COALESCE(tf.description, '') || ' ' || tf.label, p_search_text)::float AS similarity
  FROM public.team_focus tf
  WHERE tf.team_id = p_team_id
    AND tf.completed_at IS NOT NULL
    AND (p_exclude_id IS NULL OR tf.id != p_exclude_id)
    AND extensions.similarity(tf.title || ' ' || COALESCE(tf.description, '') || ' ' || tf.label, p_search_text) > 0.1
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;
