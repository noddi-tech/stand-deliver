ALTER TABLE public.team_focus
  ADD COLUMN parent_id uuid REFERENCES public.team_focus(id) ON DELETE SET NULL;

CREATE INDEX idx_team_focus_parent ON public.team_focus(parent_id);