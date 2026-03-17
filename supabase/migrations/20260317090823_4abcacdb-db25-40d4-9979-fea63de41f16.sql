-- View: unclassified activities from the last 30 days
CREATE OR REPLACE VIEW public.unclassified_activities AS
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

-- Index to speed up the LEFT JOIN anti-pattern
CREATE INDEX IF NOT EXISTS idx_impact_class_activity_lookup
  ON public.impact_classifications (activity_id);