
-- ClickUp installations (org-level)
CREATE TABLE public.clickup_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_token_encrypted text NOT NULL,
  clickup_team_id text NOT NULL,
  clickup_team_name text,
  installed_by uuid REFERENCES auth.users(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- RLS policies for clickup_installations
ALTER TABLE public.clickup_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view clickup installations"
  ON public.clickup_installations FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert clickup installations"
  ON public.clickup_installations FOR INSERT TO authenticated
  WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update clickup installations"
  ON public.clickup_installations FOR UPDATE TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can delete clickup installations"
  ON public.clickup_installations FOR DELETE TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- ClickUp user mappings (user-level)
CREATE TABLE public.clickup_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clickup_member_id text NOT NULL,
  clickup_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- RLS policies for clickup_user_mappings
ALTER TABLE public.clickup_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view clickup user mappings"
  ON public.clickup_user_mappings FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Users can insert own clickup mapping"
  ON public.clickup_user_mappings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_org_member(auth.uid(), org_id));

CREATE POLICY "Users can update own clickup mapping"
  ON public.clickup_user_mappings FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own clickup mapping"
  ON public.clickup_user_mappings FOR DELETE TO authenticated
  USING (user_id = auth.uid());
