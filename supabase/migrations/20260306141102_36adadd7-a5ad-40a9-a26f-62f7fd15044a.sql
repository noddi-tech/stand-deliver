
-- Allow team leads to update team_members (role, is_active)
CREATE POLICY "Team leads can update team members"
ON public.team_members
FOR UPDATE
TO authenticated
USING (is_team_lead(auth.uid(), team_id))
WITH CHECK (is_team_lead(auth.uid(), team_id));

-- Allow org owners/admins to update organization name
CREATE POLICY "Org owners can update org"
ON public.organizations
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members
  WHERE org_id = organizations.id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
));
