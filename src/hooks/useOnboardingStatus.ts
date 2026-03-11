import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingStatus {
  hasOrg: boolean;
  hasTeam: boolean;
  orgId: string | null;
  teamId: string | null;
  loading: boolean;
}

export function useOnboardingStatus() {
  const { user } = useAuth();

  // Dev bypass — skip onboarding checks
  if (import.meta.env.DEV) {
    return { hasOrg: true, hasTeam: true, orgId: "dev-org", teamId: "dev-team", loading: false };
  }

  const [status, setStatus] = useState<OnboardingStatus>({
    hasOrg: false,
    hasTeam: false,
    orgId: null,
    teamId: null,
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setStatus({ hasOrg: false, hasTeam: false, orgId: null, teamId: null, loading: false });
      return;
    }

    async function check() {
      // Check org membership
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("org_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();

      if (!orgMember) {
        setStatus({ hasOrg: false, hasTeam: false, orgId: null, teamId: null, loading: false });
        return;
      }

      // Check team membership
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      setStatus({
        hasOrg: true,
        hasTeam: !!teamMember,
        orgId: orgMember.org_id,
        teamId: teamMember?.team_id ?? null,
        loading: false,
      });
    }

    check();
  }, [user]);

  return status;
}
