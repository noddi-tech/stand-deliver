
-- GitHub installations table (org-level)
CREATE TABLE public.github_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  api_token_encrypted text NOT NULL,
  github_org_name text,
  installed_by uuid REFERENCES auth.users(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view github installations"
ON public.github_installations FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert github installations"
ON public.github_installations FOR INSERT TO authenticated
WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update github installations"
ON public.github_installations FOR UPDATE TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can delete github installations"
ON public.github_installations FOR DELETE TO authenticated
USING (is_org_member(auth.uid(), org_id));

-- GitHub user mappings table
CREATE TABLE public.github_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username text NOT NULL,
  github_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

ALTER TABLE public.github_user_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view github user mappings"
ON public.github_user_mappings FOR SELECT TO authenticated
USING (is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert github user mappings"
ON public.github_user_mappings FOR INSERT TO authenticated
WITH CHECK (is_org_member(auth.uid(), org_id));

CREATE POLICY "Users can update own github mapping"
ON public.github_user_mappings FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own github mapping"
ON public.github_user_mappings FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Add cross_platform_activity column to ai_weekly_digests
ALTER TABLE public.ai_weekly_digests
ADD COLUMN cross_platform_activity jsonb DEFAULT '{}'::jsonb;
