
-- 1. Create commitment_history table
CREATE TABLE IF NOT EXISTS public.commitment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES public.commitments(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.standup_sessions(id),
  old_status TEXT,
  new_status TEXT,
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.commitment_history ENABLE ROW LEVEL SECURITY;

-- RLS: team members can view commitment history
CREATE POLICY "Team members can view commitment history"
  ON public.commitment_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.commitments c
      JOIN public.team_members tm ON c.team_id = tm.team_id
      WHERE c.id = commitment_history.commitment_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
    )
  );

-- RLS: team members can insert commitment history
CREATE POLICY "Team members can insert commitment history"
  ON public.commitment_history
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.commitments c
      JOIN public.team_members tm ON c.team_id = tm.team_id
      WHERE c.id = commitment_history.commitment_id
        AND tm.user_id = auth.uid()
        AND tm.is_active = true
    )
  );

-- 2. Create carry_forward_commitments function
CREATE OR REPLACE FUNCTION public.carry_forward_commitments(p_team_id UUID, p_session_id UUID)
RETURNS INTEGER AS $$
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
    AND (current_session_id IS NULL OR current_session_id != p_session_id);

  GET DIAGNOSTICS carried_count = ROW_COUNT;
  RETURN carried_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger function for status change logging
CREATE OR REPLACE FUNCTION public.log_commitment_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.commitment_history (commitment_id, session_id, old_status, new_status, changed_at)
    VALUES (NEW.id, NEW.current_session_id, OLD.status::TEXT, NEW.status::TEXT, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create trigger
CREATE TRIGGER commitment_status_change_trigger
  AFTER UPDATE ON public.commitments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_commitment_status_change();
