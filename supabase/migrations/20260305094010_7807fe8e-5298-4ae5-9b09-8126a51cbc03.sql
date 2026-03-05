
CREATE OR REPLACE FUNCTION public.create_org_and_join(
  p_name text,
  p_slug text,
  p_slack_workspace_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If slack_workspace_id provided, check for existing org
  IF p_slack_workspace_id IS NOT NULL THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE slack_workspace_id = p_slack_workspace_id
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      -- Auto-join existing org as member (ignore if already member)
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'member')
      ON CONFLICT (user_id, org_id) DO NOTHING;
      
      RETURN v_org_id;
    END IF;
  END IF;

  -- Create new org
  INSERT INTO public.organizations (name, slug, slack_workspace_id)
  VALUES (p_name, p_slug, p_slack_workspace_id)
  RETURNING id INTO v_org_id;

  -- Add creator as owner
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  RETURN v_org_id;
END;
$$;
