
-- Create slack_installations table
CREATE TABLE public.slack_installations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  workspace_name text NOT NULL,
  bot_token text NOT NULL,
  bot_user_id text,
  installing_user_id uuid REFERENCES public.profiles(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, workspace_id)
);

ALTER TABLE public.slack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view slack installations"
  ON public.slack_installations FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert slack installations"
  ON public.slack_installations FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update slack installations"
  ON public.slack_installations FOR UPDATE
  USING (is_org_member(auth.uid(), org_id));

-- Create slack_user_mappings table
CREATE TABLE public.slack_user_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL,
  slack_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, slack_user_id)
);

ALTER TABLE public.slack_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view slack user mappings"
  ON public.slack_user_mappings FOR SELECT
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert slack user mappings"
  ON public.slack_user_mappings FOR INSERT
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update slack user mappings"
  ON public.slack_user_mappings FOR UPDATE
  USING (is_org_member(auth.uid(), org_id));
