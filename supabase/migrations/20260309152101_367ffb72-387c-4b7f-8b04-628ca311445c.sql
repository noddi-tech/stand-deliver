
DROP POLICY IF EXISTS "Users can insert own clickup mapping" ON public.clickup_user_mappings;

CREATE POLICY "Org members can insert clickup user mappings"
ON public.clickup_user_mappings
FOR INSERT
TO authenticated
WITH CHECK (is_org_member(auth.uid(), org_id));
