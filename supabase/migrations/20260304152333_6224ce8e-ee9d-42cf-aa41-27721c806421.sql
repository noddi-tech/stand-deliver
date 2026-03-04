
-- Create enum for recommendation types
CREATE TYPE public.recommendation_type AS ENUM (
  'focus_suggestion',
  'blocker_alert',
  'carry_over_warning',
  'workload_balance',
  'pattern_insight',
  'celebration'
);

-- Create focus_recommendations table
CREATE TABLE public.focus_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.standup_sessions(id) ON DELETE SET NULL,
  recommendation_type recommendation_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  is_dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
CREATE POLICY "Team members can view recommendations"
  ON public.focus_recommendations FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert recommendations"
  ON public.focus_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id));

CREATE POLICY "Members can dismiss own recommendations"
  ON public.focus_recommendations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = focus_recommendations.member_id AND tm.user_id = auth.uid()
  ));
