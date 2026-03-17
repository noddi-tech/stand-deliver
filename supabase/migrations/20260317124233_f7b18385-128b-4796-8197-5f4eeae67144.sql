
-- Create activity_badges table
CREATE TABLE public.activity_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  source_type text NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  badge_key text NOT NULL,
  badge_source text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  manual_override boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_activity_badges_unique ON activity_badges (activity_id, source_type);

ALTER TABLE activity_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view activity badges"
  ON activity_badges FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert activity badges"
  ON activity_badges FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can update activity badges"
  ON activity_badges FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- Create conditional upsert function
CREATE OR REPLACE FUNCTION public.upsert_activity_badge(
  p_activity_id uuid,
  p_source_type text,
  p_team_id uuid,
  p_badge_key text,
  p_badge_source text,
  p_confidence numeric
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO activity_badges (activity_id, source_type, team_id, badge_key, badge_source, confidence)
  VALUES (p_activity_id, p_source_type, p_team_id, p_badge_key, p_badge_source, p_confidence)
  ON CONFLICT (activity_id, source_type)
  DO UPDATE SET
    badge_key = EXCLUDED.badge_key,
    badge_source = EXCLUDED.badge_source,
    confidence = EXCLUDED.confidence,
    updated_at = now()
  WHERE activity_badges.badge_source != 'manual'
    AND activity_badges.confidence < EXCLUDED.confidence;
$$;
