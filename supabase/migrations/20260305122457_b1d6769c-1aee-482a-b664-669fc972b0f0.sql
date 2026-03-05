
DROP FUNCTION IF EXISTS public.create_org_and_join(text, text, text);

CREATE FUNCTION public.create_org_and_join(
  p_name text,
  p_slug text,
  p_slack_workspace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_org_name text;
  v_is_existing boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_slack_workspace_id IS NOT NULL THEN
    SELECT id, name INTO v_org_id, v_org_name
    FROM public.organizations
    WHERE slack_workspace_id = p_slack_workspace_id
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      v_is_existing := true;
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'member')
      ON CONFLICT (user_id, org_id) DO NOTHING;

      RETURN jsonb_build_object(
        'org_id', v_org_id,
        'org_name', v_org_name,
        'is_existing', v_is_existing
      );
    END IF;
  END IF;

  INSERT INTO public.organizations (name, slug, slack_workspace_id)
  VALUES (p_name, p_slug, p_slack_workspace_id)
  RETURNING id, name INTO v_org_id, v_org_name;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner');

  RETURN jsonb_build_object(
    'org_id', v_org_id,
    'org_name', v_org_name,
    'is_existing', v_is_existing
  );
END;
$$;
