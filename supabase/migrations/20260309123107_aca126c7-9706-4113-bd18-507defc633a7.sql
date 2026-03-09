
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, notification_type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team leads can insert notification preferences"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (is_team_lead(auth.uid(), team_id));

CREATE POLICY "Team leads can update notification preferences"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (is_team_lead(auth.uid(), team_id));
