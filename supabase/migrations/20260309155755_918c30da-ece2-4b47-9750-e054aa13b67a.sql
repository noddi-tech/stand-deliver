
DROP POLICY IF EXISTS "Users can delete own github mapping" ON public.github_user_mappings;
CREATE POLICY "Org members can delete github user mappings"
ON public.github_user_mappings
FOR DELETE
TO authenticated
USING (is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Users can update own github mapping" ON public.github_user_mappings;
CREATE POLICY "Org members can update github user mappings"
ON public.github_user_mappings
FOR UPDATE
TO authenticated
USING (is_org_member(auth.uid(), org_id));
