
-- Badge definitions table (seed data included)
CREATE TABLE public.badge_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL,
  category text NOT NULL DEFAULT 'personal',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view badge definitions"
  ON public.badge_definitions FOR SELECT
  TO authenticated
  USING (true);

-- Member badges table
CREATE TABLE public.member_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES public.badge_definitions(id),
  earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE(member_id, badge_id, earned_at)
);

ALTER TABLE public.member_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view badges"
  ON public.member_badges FOR SELECT
  TO authenticated
  USING (is_team_member(auth.uid(), team_id));

CREATE POLICY "Team members can insert badges"
  ON public.member_badges FOR INSERT
  TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id));

-- Seed badge definitions
INSERT INTO public.badge_definitions (id, name, description, emoji, category, criteria) VALUES
  ('surgeon', 'Surgeon', 'Merged a PR that fixed a bug in under 10 lines', '🔬', 'personal', '{"type":"pr_bugfix_small","max_lines":10}'),
  ('janitor', 'Janitor', 'Net negative lines of code in a week — cleaned up more than added', '🧹', 'personal', '{"type":"net_negative_loc_week"}'),
  ('speed_reviewer', 'Speed Reviewer', 'Reviewed 3+ PRs within 2 hours of being requested', '⚡', 'personal', '{"type":"fast_reviews","min_reviews":3,"max_hours":2}'),
  ('promise_keeper', 'Promise Keeper', 'Completed all standup commitments 5 days in a row', '🎯', 'personal', '{"type":"commitment_streak","min_days":5}'),
  ('collaborator', 'Collaborator', 'Co-authored commits with 3+ different team members in a month', '🤝', 'personal', '{"type":"co_authors","min_collaborators":3,"days":30}'),
  ('shipper', 'Shipper', 'Had a PR go from open to merged in under 4 hours', '📦', 'personal', '{"type":"fast_pr_merge","max_hours":4}'),
  ('streak', 'Streak', 'Committed every workday for 2 weeks', '🔁', 'personal', '{"type":"daily_commit_streak","min_days":10}'),
  ('architect', 'Architect', 'Touched 5+ files across 3+ directories in a single PR', '🏗️', 'personal', '{"type":"large_pr_scope","min_files":5,"min_dirs":3}'),
  ('first_commit', 'First Commit', 'First contribution to a new repository', '🌱', 'personal', '{"type":"first_repo_commit"}'),
  ('guardian', 'Guardian', 'Caught a bug in code review — PR comment led to a change before merge', '🛡️', 'personal', '{"type":"review_catch"}');
