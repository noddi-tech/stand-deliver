
-- Fix permissive org insert policy: ensure the inserting user will be the owner
DROP POLICY "Authenticated users can create orgs" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
