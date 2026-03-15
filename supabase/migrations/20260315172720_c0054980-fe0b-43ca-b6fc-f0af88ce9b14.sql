
ALTER TABLE public.commitments ADD COLUMN github_ref text;

ALTER TABLE public.teams ADD COLUMN standup_day_modes jsonb NOT NULL DEFAULT '{}'::jsonb;
