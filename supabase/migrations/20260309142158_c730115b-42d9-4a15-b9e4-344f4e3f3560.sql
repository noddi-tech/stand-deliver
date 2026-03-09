CREATE POLICY "Members can update own responses"
ON public.standup_responses FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM team_members tm
  WHERE tm.id = standup_responses.member_id AND tm.user_id = auth.uid()
));