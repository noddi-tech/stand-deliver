
-- ============================================================
-- 1. Convert all 64 RESTRICTIVE policies to PERMISSIVE
-- ============================================================

-- ai_weekly_digests
DROP POLICY IF EXISTS "Team leads can insert digests" ON ai_weekly_digests;
DROP POLICY IF EXISTS "Team members can view digests" ON ai_weekly_digests;
DROP POLICY IF EXISTS "Team leads can update digests" ON ai_weekly_digests;
CREATE POLICY "Team leads can insert digests" ON ai_weekly_digests FOR INSERT TO authenticated WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team members can view digests" ON ai_weekly_digests FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team leads can update digests" ON ai_weekly_digests FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id));

-- blockers
DROP POLICY IF EXISTS "Members can insert blockers" ON blockers;
DROP POLICY IF EXISTS "Team members can view blockers" ON blockers;
DROP POLICY IF EXISTS "Members can update blockers" ON blockers;
CREATE POLICY "Members can insert blockers" ON blockers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = blockers.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view blockers" ON blockers FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can update blockers" ON blockers FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));

-- clickup_installations
DROP POLICY IF EXISTS "Org members can view clickup installations" ON clickup_installations;
DROP POLICY IF EXISTS "Org members can insert clickup installations" ON clickup_installations;
DROP POLICY IF EXISTS "Org members can update clickup installations" ON clickup_installations;
DROP POLICY IF EXISTS "Org members can delete clickup installations" ON clickup_installations;
CREATE POLICY "Org members can view clickup installations" ON clickup_installations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can insert clickup installations" ON clickup_installations FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update clickup installations" ON clickup_installations FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can delete clickup installations" ON clickup_installations FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- clickup_user_mappings
DROP POLICY IF EXISTS "Org members can view clickup user mappings" ON clickup_user_mappings;
DROP POLICY IF EXISTS "Users can update own clickup mapping" ON clickup_user_mappings;
DROP POLICY IF EXISTS "Users can delete own clickup mapping" ON clickup_user_mappings;
DROP POLICY IF EXISTS "Org members can insert clickup user mappings" ON clickup_user_mappings;
CREATE POLICY "Org members can view clickup user mappings" ON clickup_user_mappings FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Users can update own clickup mapping" ON clickup_user_mappings FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can delete own clickup mapping" ON clickup_user_mappings FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Org members can insert clickup user mappings" ON clickup_user_mappings FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));

-- commitment_history
DROP POLICY IF EXISTS "Team members can insert commitment history" ON commitment_history;
DROP POLICY IF EXISTS "Team members can view commitment history" ON commitment_history;
CREATE POLICY "Team members can insert commitment history" ON commitment_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM commitments c JOIN team_members tm ON c.team_id = tm.team_id WHERE c.id = commitment_history.commitment_id AND tm.user_id = auth.uid() AND tm.is_active = true));
CREATE POLICY "Team members can view commitment history" ON commitment_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM commitments c JOIN team_members tm ON c.team_id = tm.team_id WHERE c.id = commitment_history.commitment_id AND tm.user_id = auth.uid() AND tm.is_active = true));

-- commitments
DROP POLICY IF EXISTS "Members can insert commitments" ON commitments;
DROP POLICY IF EXISTS "Team members can view commitments" ON commitments;
DROP POLICY IF EXISTS "Members can update own commitments" ON commitments;
CREATE POLICY "Members can insert commitments" ON commitments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = commitments.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view commitments" ON commitments FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can update own commitments" ON commitments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = commitments.member_id AND tm.user_id = auth.uid()));

-- external_activity
DROP POLICY IF EXISTS "Team members can view external activity" ON external_activity;
DROP POLICY IF EXISTS "Team members can update external activity" ON external_activity;
DROP POLICY IF EXISTS "Service role can insert external activity" ON external_activity;
CREATE POLICY "Team members can view external activity" ON external_activity FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can update external activity" ON external_activity FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Service role can insert external activity" ON external_activity FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id));

-- focus_recommendations
DROP POLICY IF EXISTS "Team members can insert recommendations" ON focus_recommendations;
DROP POLICY IF EXISTS "Team members can view recommendations" ON focus_recommendations;
DROP POLICY IF EXISTS "Members can dismiss own recommendations" ON focus_recommendations;
CREATE POLICY "Team members can insert recommendations" ON focus_recommendations FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can view recommendations" ON focus_recommendations FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can dismiss own recommendations" ON focus_recommendations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = focus_recommendations.member_id AND tm.user_id = auth.uid()));

-- github_installations
DROP POLICY IF EXISTS "Org members can view github installations" ON github_installations;
DROP POLICY IF EXISTS "Org members can insert github installations" ON github_installations;
DROP POLICY IF EXISTS "Org members can update github installations" ON github_installations;
DROP POLICY IF EXISTS "Org members can delete github installations" ON github_installations;
CREATE POLICY "Org members can view github installations" ON github_installations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can insert github installations" ON github_installations FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update github installations" ON github_installations FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can delete github installations" ON github_installations FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- github_user_mappings
DROP POLICY IF EXISTS "Org members can delete github user mappings" ON github_user_mappings;
DROP POLICY IF EXISTS "Org members can update github user mappings" ON github_user_mappings;
DROP POLICY IF EXISTS "Org members can view github user mappings" ON github_user_mappings;
DROP POLICY IF EXISTS "Org members can insert github user mappings" ON github_user_mappings;
CREATE POLICY "Org members can delete github user mappings" ON github_user_mappings FOR DELETE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update github user mappings" ON github_user_mappings FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view github user mappings" ON github_user_mappings FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can insert github user mappings" ON github_user_mappings FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));

-- notification_preferences
DROP POLICY IF EXISTS "Team members can view notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Team leads can insert notification preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Team leads can update notification preferences" ON notification_preferences;
CREATE POLICY "Team members can view notification preferences" ON notification_preferences FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team leads can insert notification preferences" ON notification_preferences FOR INSERT TO authenticated WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team leads can update notification preferences" ON notification_preferences FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id));

-- organization_members (FIX: restrict INSERT to org admins/owners only)
DROP POLICY IF EXISTS "Authenticated can insert org members" ON organization_members;
DROP POLICY IF EXISTS "Org members can view members" ON organization_members;
CREATE POLICY "Org admins can insert members" ON organization_members FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = organization_members.org_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
  )
);
CREATE POLICY "Org members can view members" ON organization_members FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));

-- organizations
DROP POLICY IF EXISTS "Org owners can update org" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON organizations;
DROP POLICY IF EXISTS "Org members can view org" ON organizations;
CREATE POLICY "Org owners can update org" ON organizations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM organization_members WHERE organization_members.org_id = organizations.id AND organization_members.user_id = auth.uid() AND organization_members.role IN ('owner', 'admin')));
CREATE POLICY "Authenticated users can create orgs" ON organizations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Org members can view org" ON organizations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), id));

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can view all profiles" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- slack_installations
DROP POLICY IF EXISTS "Org members can update slack installations" ON slack_installations;
DROP POLICY IF EXISTS "Org members can insert slack installations" ON slack_installations;
DROP POLICY IF EXISTS "Org members can view slack installations" ON slack_installations;
CREATE POLICY "Org members can update slack installations" ON slack_installations FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can insert slack installations" ON slack_installations FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view slack installations" ON slack_installations FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));

-- slack_invites
DROP POLICY IF EXISTS "Org members can view invites" ON slack_invites;
DROP POLICY IF EXISTS "Org members can insert invites" ON slack_invites;
DROP POLICY IF EXISTS "Org members can update invites" ON slack_invites;
CREATE POLICY "Org members can view invites" ON slack_invites FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can insert invites" ON slack_invites FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update invites" ON slack_invites FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- slack_user_mappings
DROP POLICY IF EXISTS "Org members can insert slack user mappings" ON slack_user_mappings;
DROP POLICY IF EXISTS "Org members can view slack user mappings" ON slack_user_mappings;
DROP POLICY IF EXISTS "Org members can update slack user mappings" ON slack_user_mappings;
CREATE POLICY "Org members can insert slack user mappings" ON slack_user_mappings FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view slack user mappings" ON slack_user_mappings FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update slack user mappings" ON slack_user_mappings FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- standup_responses
DROP POLICY IF EXISTS "Members can update own responses" ON standup_responses;
DROP POLICY IF EXISTS "Members can insert own responses" ON standup_responses;
DROP POLICY IF EXISTS "Team members can view responses" ON standup_responses;
CREATE POLICY "Members can update own responses" ON standup_responses FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = standup_responses.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Members can insert own responses" ON standup_responses FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.id = standup_responses.member_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can view responses" ON standup_responses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM standup_sessions ss WHERE ss.id = standup_responses.session_id AND is_team_member(auth.uid(), ss.team_id)));

-- standup_sessions
DROP POLICY IF EXISTS "Team members can create sessions" ON standup_sessions;
DROP POLICY IF EXISTS "Team members can view sessions" ON standup_sessions;
DROP POLICY IF EXISTS "Team members can update sessions" ON standup_sessions;
CREATE POLICY "Team members can create sessions" ON standup_sessions FOR INSERT TO authenticated WITH CHECK (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can view sessions" ON standup_sessions FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can update sessions" ON standup_sessions FOR UPDATE TO authenticated USING (is_team_member(auth.uid(), team_id));

-- team_members
DROP POLICY IF EXISTS "Team leads can update team members" ON team_members;
DROP POLICY IF EXISTS "Org members can add team members" ON team_members;
DROP POLICY IF EXISTS "Team members can view team members" ON team_members;
CREATE POLICY "Team leads can update team members" ON team_members FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id)) WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Org members can add team members" ON team_members FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), get_team_org(team_id)));
CREATE POLICY "Team members can view team members" ON team_members FOR SELECT TO authenticated USING (is_org_member(auth.uid(), get_team_org(team_id)));

-- teams
DROP POLICY IF EXISTS "Org members can create teams" ON teams;
DROP POLICY IF EXISTS "Org members can view teams" ON teams;
DROP POLICY IF EXISTS "Org members can update teams" ON teams;
CREATE POLICY "Org members can create teams" ON teams FOR INSERT TO authenticated WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can view teams" ON teams FOR SELECT TO authenticated USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update teams" ON teams FOR UPDATE TO authenticated USING (is_org_member(auth.uid(), org_id));

-- ============================================================
-- 2. Revoke SELECT on api_token_encrypted columns
-- ============================================================
REVOKE SELECT (api_token_encrypted) ON clickup_installations FROM authenticated, anon;
REVOKE SELECT (api_token_encrypted) ON github_installations FROM authenticated, anon;
REVOKE SELECT (bot_token) ON slack_installations FROM authenticated, anon;

-- ============================================================
-- 3. Create slack_oauth_states table for nonce-based OAuth
-- ============================================================
CREATE TABLE IF NOT EXISTS public.slack_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce text NOT NULL UNIQUE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slack_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only the service role should access this table (edge functions)
-- No permissive policies = no client access, which is what we want
