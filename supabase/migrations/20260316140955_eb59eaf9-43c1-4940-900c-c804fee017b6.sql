
-- Table 1: impact_classifications — per-item AI classification results
CREATE TABLE public.impact_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  source_type text NOT NULL, -- 'external_activity', 'commitment', 'standup_response'
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  impact_tier text NOT NULL, -- critical, high, standard, low
  value_type text NOT NULL, -- ship, quality, foundation, growth, unblock
  focus_alignment text NOT NULL DEFAULT 'none', -- direct, indirect, none
  focus_item_id uuid REFERENCES public.team_focus(id) ON DELETE SET NULL,
  reasoning text,
  impact_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_impact_class_unique ON public.impact_classifications (activity_id, source_type);
CREATE INDEX idx_impact_class_team_week ON public.impact_classifications (team_id, created_at);
CREATE INDEX idx_impact_class_member ON public.impact_classifications (member_id, created_at);

-- RLS for impact_classifications
ALTER TABLE public.impact_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view impact classifications"
ON public.impact_classifications FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), team_id));

-- Table 2: weekly_vis_scores — aggregated weekly snapshots
CREATE TABLE public.weekly_vis_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  raw_impact numeric NOT NULL DEFAULT 0,
  normalized_impact numeric NOT NULL DEFAULT 0,
  delivery_score numeric NOT NULL DEFAULT 0,
  multiplier_score numeric NOT NULL DEFAULT 0,
  focus_ratio numeric NOT NULL DEFAULT 0,
  vis_total numeric NOT NULL DEFAULT 0,
  breakdown jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_weekly_vis_unique ON public.weekly_vis_scores (team_id, member_id, week_start);

-- RLS for weekly_vis_scores
ALTER TABLE public.weekly_vis_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view weekly VIS scores"
ON public.weekly_vis_scores FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), team_id));
