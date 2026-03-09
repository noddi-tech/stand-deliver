
CREATE TABLE public.slack_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  slack_user_id text NOT NULL,
  slack_display_name text,
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slack_user_id)
);

ALTER TABLE public.slack_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view invites"
  ON public.slack_invites FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert invites"
  ON public.slack_invites FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update invites"
  ON public.slack_invites FOR UPDATE
  TO authenticated
  USING (is_org_member(auth.uid(), org_id));
