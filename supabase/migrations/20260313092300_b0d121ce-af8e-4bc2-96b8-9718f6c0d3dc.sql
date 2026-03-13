
CREATE OR REPLACE FUNCTION public.carry_forward_commitments(p_team_id uuid, p_session_id uuid, p_member_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  carried_count INTEGER;
BEGIN
  UPDATE public.commitments
  SET 
    status = 'carried',
    carry_count = carry_count + 1,
    current_session_id = p_session_id,
    updated_at = NOW()
  WHERE team_id = p_team_id
    AND status IN ('active', 'in_progress')
    AND (current_session_id IS NULL OR current_session_id != p_session_id)
    AND (p_member_id IS NULL OR member_id = p_member_id);

  GET DIAGNOSTICS carried_count = ROW_COUNT;
  RETURN carried_count;
END;
$$;
