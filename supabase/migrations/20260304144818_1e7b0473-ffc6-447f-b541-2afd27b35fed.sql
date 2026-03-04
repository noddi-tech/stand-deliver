
-- Enums
CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.team_role AS ENUM ('lead', 'member');
CREATE TYPE public.session_type AS ENUM ('async', 'sync', 'physical');
CREATE TYPE public.session_status AS ENUM ('scheduled', 'collecting', 'in_progress', 'completed');
CREATE TYPE public.commitment_status AS ENUM ('active', 'done', 'in_progress', 'blocked', 'dropped', 'carried');
CREATE TYPE public.commitment_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.mood_type AS ENUM ('great', 'good', 'okay', 'struggling', 'rough');
CREATE TYPE public.submission_via AS ENUM ('web', 'slack', 'physical');
CREATE TYPE public.blocker_category AS ENUM ('dependency', 'technical', 'external', 'resource', 'unclear_requirements', 'other');

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization Members
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slack_channel_id TEXT,
  standup_days TEXT[] NOT NULL DEFAULT '{mon,tue,wed,thu,fri}',
  standup_time TIME NOT NULL DEFAULT '09:00',
  standup_timezone TEXT NOT NULL DEFAULT 'UTC',
  timer_seconds_per_person INT NOT NULL DEFAULT 120,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team Members
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'member',
  slack_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Standup Sessions
CREATE TABLE public.standup_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  session_type session_type NOT NULL DEFAULT 'async',
  status session_status NOT NULL DEFAULT 'scheduled',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  ai_summary TEXT,
  ai_insights JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, session_date)
);

-- Standup Responses
CREATE TABLE public.standup_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.standup_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  yesterday_text TEXT,
  today_text TEXT,
  blockers_text TEXT,
  notes TEXT,
  mood mood_type,
  submitted_via submission_via NOT NULL DEFAULT 'web',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INT,
  UNIQUE(session_id, member_id)
);

-- Commitments
CREATE TABLE public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  origin_session_id UUID REFERENCES public.standup_sessions(id),
  current_session_id UUID REFERENCES public.standup_sessions(id),
  title TEXT NOT NULL,
  description TEXT,
  status commitment_status NOT NULL DEFAULT 'active',
  priority commitment_priority NOT NULL DEFAULT 'medium',
  carry_count INT NOT NULL DEFAULT 0,
  blocked_reason TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blockers
CREATE TABLE public.blockers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  commitment_id UUID REFERENCES public.commitments(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.standup_sessions(id),
  description TEXT NOT NULL,
  category blocker_category NOT NULL DEFAULT 'other',
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.team_members(id),
  resolution_note TEXT,
  days_open INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Helper function to check org membership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND org_id = _org_id
  );
$$;

-- Helper function to check team membership
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID, _team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id AND is_active = true
  );
$$;

-- Helper to get team's org
CREATE OR REPLACE FUNCTION public.get_team_org(_team_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.teams WHERE id = _team_id;
$$;

-- RLS Policies

-- Profiles: users can read all profiles, update own
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Organizations: members can read
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view org" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id));
CREATE POLICY "Authenticated users can create orgs" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

-- Organization Members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view members" ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Authenticated can insert org members" ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(auth.uid(), org_id));

-- Teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members can view teams" ON public.teams FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can create teams" ON public.teams FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Org members can update teams" ON public.teams FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

-- Team Members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view team members" ON public.team_members FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), public.get_team_org(team_id)));
CREATE POLICY "Org members can add team members" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), public.get_team_org(team_id)));

-- Standup Sessions
ALTER TABLE public.standup_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view sessions" ON public.standup_sessions FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can create sessions" ON public.standup_sessions FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can update sessions" ON public.standup_sessions FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

-- Standup Responses
ALTER TABLE public.standup_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view responses" ON public.standup_responses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.standup_sessions ss
    WHERE ss.id = session_id AND public.is_team_member(auth.uid(), ss.team_id)
  ));
CREATE POLICY "Members can insert own responses" ON public.standup_responses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = member_id AND tm.user_id = auth.uid()
  ));

-- Commitments
ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view commitments" ON public.commitments FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can insert commitments" ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = member_id AND tm.user_id = auth.uid()
  ));
CREATE POLICY "Members can update own commitments" ON public.commitments FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = member_id AND tm.user_id = auth.uid()
  ));

-- Blockers
ALTER TABLE public.blockers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members can view blockers" ON public.blockers FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY "Members can insert blockers" ON public.blockers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.id = member_id AND tm.user_id = auth.uid()
  ));
CREATE POLICY "Members can update blockers" ON public.blockers FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
