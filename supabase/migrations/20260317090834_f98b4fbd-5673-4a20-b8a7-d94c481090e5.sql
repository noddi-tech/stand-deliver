-- Fix security definer view: use SECURITY INVOKER so RLS is enforced
CREATE OR REPLACE VIEW public.unclassified_activities
WITH (security_invoker = on) AS
SELECT
  ea.id,
  ea.activity_type,
  ea.title,
  ea.source,
  ea.team_id,
  ea.member_id,
  ea.metadata,
  ea.occurred_at
FROM public.external_activity ea
LEFT JOIN public.impact_classifications ic
  ON ea.id = ic.activity_id AND ic.source_type = 'external_activity'
WHERE ic.id IS NULL
  AND ea.occurred_at > now() - interval '30 days';