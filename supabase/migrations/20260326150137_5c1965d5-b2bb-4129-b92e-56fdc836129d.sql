
-- Enable pg_trgm for text similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- focus_retrospectives: AI-generated retrospectives for completed focus areas
-- Writes happen ONLY via service_role from edge functions.
-- No INSERT/UPDATE/DELETE RLS policies for authenticated users.
-- ============================================================
CREATE TABLE public.focus_retrospectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_item_id uuid NOT NULL REFERENCES public.team_focus(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  metrics jsonb NOT NULL DEFAULT '{}',
  ai_narrative text,
  ai_recommendations jsonb DEFAULT '[]',
  completed_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: SELECT only for team members. INSERT/UPDATE reserved for service_role.
CREATE POLICY "Team members can view retrospectives"
  ON public.focus_retrospectives FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- ============================================================
-- focus_gap_analyses: persisted AI gap analysis between v1 and v2 focus areas
-- ============================================================
CREATE TABLE public.focus_gap_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  v1_focus_id uuid NOT NULL REFERENCES public.team_focus(id) ON DELETE CASCADE,
  v2_focus_id uuid NOT NULL REFERENCES public.team_focus(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  suggestions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE POLICY "Team members can view gap analyses"
  ON public.focus_gap_analyses FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can update gap analyses"
  ON public.focus_gap_analyses FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- ============================================================
-- focus_insights: proactive pattern detection results
-- ============================================================
CREATE TABLE public.focus_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  focus_item_id uuid REFERENCES public.team_focus(id) ON DELETE SET NULL,
  insight_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.7,
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE POLICY "Team members can view insights"
  ON public.focus_insights FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can dismiss insights"
  ON public.focus_insights FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- ============================================================
-- Extend team_focus: add predecessor_id and completed_at
-- No completion_summary_id — retrospective is looked up via focus_retrospectives.focus_item_id
-- ============================================================
ALTER TABLE public.team_focus
  ADD COLUMN predecessor_id uuid DEFAULT NULL REFERENCES public.team_focus(id) ON DELETE SET NULL,
  ADD COLUMN completed_at timestamptz DEFAULT NULL;

-- ============================================================
-- pg_trgm similarity search function for finding related completed focus areas
-- ============================================================
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    tf.id, tf.title, tf.description, tf.label, tf.completed_at,
    similarity(tf.title || ' ' || COALESCE(tf.description, '') || ' ' || tf.label, p_search_text)::float AS similarity
  FROM public.team_focus tf
  WHERE tf.team_id = p_team_id
    AND tf.completed_at IS NOT NULL
    AND (p_exclude_id IS NULL OR tf.id != p_exclude_id)
    AND similarity(tf.title || ' ' || COALESCE(tf.description, '') || ' ' || tf.label, p_search_text) > 0.1
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;
