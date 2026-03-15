ALTER TABLE public.team_focus
  ADD COLUMN starts_at timestamptz,
  ADD COLUMN ends_at timestamptz;