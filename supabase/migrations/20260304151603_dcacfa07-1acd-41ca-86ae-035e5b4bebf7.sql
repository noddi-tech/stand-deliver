
-- Create a security definer function to check team lead role
CREATE OR REPLACE FUNCTION public.is_team_lead(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND role = 'lead' AND is_active = true
  );
$$;

-- Create ai_weekly_digests table
CREATE TABLE public.ai_weekly_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  week_end date NOT NULL,
  health_score integer,
  completion_rate decimal,
  total_commitments integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  total_carried integer DEFAULT 0,
  total_blocked integer DEFAULT 0,
  top_themes jsonb DEFAULT '[]'::jsonb,
  ai_narrative text,
  ai_recommendations jsonb DEFAULT '[]'::jsonb,
  work_distribution jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, week_start)
);

-- RLS policies
CREATE POLICY "Team members can view digests"
  ON public.ai_weekly_digests FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team leads can insert digests"
  ON public.ai_weekly_digests FOR INSERT
  TO authenticated
  WITH CHECK (is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can update digests"
  ON public.ai_weekly_digests FOR UPDATE
  TO authenticated
  USING (is_team_lead(auth.uid(), team_id));
