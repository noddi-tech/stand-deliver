
CREATE TABLE public.external_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  source text NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  external_id text NOT NULL,
  external_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_acknowledged boolean NOT NULL DEFAULT false
);

ALTER TABLE public.external_activity ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_external_activity_dedup ON public.external_activity (external_id, activity_type, source);

CREATE POLICY "Team members can view external activity"
  ON public.external_activity FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can update external activity"
  ON public.external_activity FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Service role can insert external activity"
  ON public.external_activity FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id));
