
CREATE TABLE public.reclassification_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  mode text NOT NULL DEFAULT 'incremental',
  processed integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  classified integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reclassification_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view reclassification jobs"
  ON public.reclassification_jobs
  FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

ALTER publication supabase_realtime ADD TABLE public.reclassification_jobs;
