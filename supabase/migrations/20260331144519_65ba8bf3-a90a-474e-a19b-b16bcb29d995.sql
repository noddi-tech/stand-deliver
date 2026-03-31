
CREATE TABLE vis_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  reference_baseline numeric NOT NULL DEFAULT 100,
  calibrated_at timestamptz DEFAULT now()
);

ALTER TABLE vis_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view vis_config"
  ON vis_config FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team leads can update vis_config"
  ON vis_config FOR UPDATE TO authenticated
  USING (is_team_lead(auth.uid(), team_id));

-- Auto-calibrate from actual data
INSERT INTO vis_config (team_id, reference_baseline, calibrated_at)
SELECT
  t.id,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY weekly_raw.total),
    100
  ),
  now()
FROM teams t
LEFT JOIN LATERAL (
  SELECT member_id, SUM(impact_score) as total
  FROM impact_classifications
  WHERE team_id = t.id
    AND created_at > now() - interval '30 days'
  GROUP BY member_id, date_trunc('week', created_at)
) weekly_raw ON true
GROUP BY t.id
ON CONFLICT (team_id) DO NOTHING;
