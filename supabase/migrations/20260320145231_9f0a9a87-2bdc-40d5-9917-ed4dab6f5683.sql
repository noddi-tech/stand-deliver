CREATE TABLE public.standup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  reminder_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (team_id, member_id, session_date)
);

ALTER TABLE public.standup_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view reminders"
  ON public.standup_reminders FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));