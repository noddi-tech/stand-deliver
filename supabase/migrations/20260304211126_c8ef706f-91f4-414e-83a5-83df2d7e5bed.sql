
-- ============================================================
-- Drop ALL existing RLS policies and recreate as PERMISSIVE
-- ============================================================

-- organizations
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.organizations;
DROP POLICY IF EXISTS "Org members can view org" ON public.organizations;
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Org members can view org" ON public.organizations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), id));

-- organization_members
DROP POLICY IF EXISTS "Authenticated can insert org members" ON public.organization_members;
DROP POLICY IF EXISTS "Org members can view members" ON public.organization_members;
CREATE POLICY "Authenticated can insert org members" ON public.organization_members FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()) OR is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view members" ON public.organization_members FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));

-- teams
DROP POLICY IF EXISTS "Org members can create teams" ON public.teams;
DROP POLICY IF EXISTS "Org members can view teams" ON public.teams;
DROP POLICY IF EXISTS "Org members can update teams" ON public.teams;
CREATE POLICY "Org members can create teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view teams" ON public.teams FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update teams" ON public.teams FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- team_members
DROP POLICY IF EXISTS "Org members can add team members" ON public.team_members;
DROP POLICY IF EXISTS "Team members can view team members" ON public.team_members;
CREATE POLICY "Org members can add team members" ON public.team_members FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), get_team_org(team_id)));
CREATE POLICY "Team members can view team members" ON public.team_members FOR SELECT TO authenticated USING (is_org_member(auth.uid(), get_team_org(team_id)));

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- standup_sessions
DROP POLICY IF EXISTS "Team members can create sessions" ON public.standup_sessions;
DROP POLICY IF EXISTS "Team members can view sessions" ON public.standup_sessions;
DROP POLICY IF EXISTS "Team members can update sessions" ON public.standup_sessions;
CREATE POLICY "Team members can create sessions" ON public.standup_sessions FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can view sessions" ON public.standup_sessions FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can update sessions" ON public.standup_sessions FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));

-- standup_responses
DROP POLICY IF EXISTS "Members can insert own responses" ON public.standup_responses;
DROP POLICY IF EXISTS "Team members can view responses" ON public.standup_responses;
CREATE POLICY "Members can insert own responses" ON public.standup_responses FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = standup_responses.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view responses" ON public.standup_responses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM standup_sessions ss WHERE ss.id = standup_responses.session_id AND is_team_member(auth.uid(), ss.team_id)));

-- commitments
DROP POLICY IF EXISTS "Members can insert commitments" ON public.commitments;
DROP POLICY IF EXISTS "Team members can view commitments" ON public.commitments;
DROP POLICY IF EXISTS "Members can update own commitments" ON public.commitments;
CREATE POLICY "Members can insert commitments" ON public.commitments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = commitments.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view commitments" ON public.commitments FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can update own commitments" ON public.commitments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = commitments.member_id AND tm.user_id = auth.uid()));

-- commitment_history
DROP POLICY IF EXISTS "Team members can insert commitment history" ON public.commitment_history;
DROP POLICY IF EXISTS "Team members can view commitment history" ON public.commitment_history;
CREATE POLICY "Team members can insert commitment history" ON public.commitment_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM commitments c JOIN team_members tm ON c.team_id = tm.team_id WHERE c.id = commitment_history.commitment_id AND tm.user_id = auth.uid() AND tm.is_active = true));
CREATE POLICY "Team members can view commitment history" ON public.commitment_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM commitments c JOIN team_members tm ON c.team_id = tm.team_id WHERE c.id = commitment_history.commitment_id AND tm.user_id = auth.uid() AND tm.is_active = true));

-- blockers
DROP POLICY IF EXISTS "Members can insert blockers" ON public.blockers;
DROP POLICY IF EXISTS "Team members can view blockers" ON public.blockers;
DROP POLICY IF EXISTS "Members can update blockers" ON public.blockers;
CREATE POLICY "Members can insert blockers" ON public.blockers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = blockers.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view blockers" ON public.blockers FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can update blockers" ON public.blockers FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));

-- focus_recommendations
DROP POLICY IF EXISTS "Team members can insert recommendations" ON public.focus_recommendations;
DROP POLICY IF EXISTS "Team members can view recommendations" ON public.focus_recommendations;
DROP POLICY IF EXISTS "Members can dismiss own recommendations" ON public.focus_recommendations;
CREATE POLICY "Team members can insert recommendations" ON public.focus_recommendations FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can view recommendations" ON public.focus_recommendations FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can dismiss own recommendations" ON public.focus_recommendations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = focus_recommendations.member_id AND tm.user_id = auth.uid()));

-- slack_installations
DROP POLICY IF EXISTS "Org members can insert slack installations" ON public.slack_installations;
DROP POLICY IF EXISTS "Org members can view slack installations" ON public.slack_installations;
DROP POLICY IF EXISTS "Org members can update slack installations" ON public.slack_installations;
CREATE POLICY "Org members can insert slack installations" ON public.slack_installations FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view slack installations" ON public.slack_installations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update slack installations" ON public.slack_installations FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- slack_user_mappings
DROP POLICY IF EXISTS "Org members can insert slack user mappings" ON public.slack_user_mappings;
DROP POLICY IF EXISTS "Org members can view slack user mappings" ON public.slack_user_mappings;
DROP POLICY IF EXISTS "Org members can update slack user mappings" ON public.slack_user_mappings;
CREATE POLICY "Org members can insert slack user mappings" ON public.slack_user_mappings FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view slack user mappings" ON public.slack_user_mappings FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update slack user mappings" ON public.slack_user_mappings FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- ai_weekly_digests
DROP POLICY IF EXISTS "Team leads can insert digests" ON public.ai_weekly_digests;
DROP POLICY IF EXISTS "Team members can view digests" ON public.ai_weekly_digests;
DROP POLICY IF EXISTS "Team leads can update digests" ON public.ai_weekly_digests;
CREATE POLICY "Team leads can insert digests" ON public.ai_weekly_digests FOR INSERT TO authenticated WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team members can view digests" ON public.ai_weekly_digests FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team leads can update digests" ON public.ai_weekly_digests FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id));
