
CREATE TABLE public.team_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view focus" ON public.team_focus
  FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team leads can insert focus" ON public.team_focus
  FOR INSERT TO authenticated WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team leads can update focus" ON public.team_focus
  FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team leads can delete focus" ON public.team_focus
  FOR DELETE TO authenticated USING (is_team_lead(auth.uid(), team_id));
