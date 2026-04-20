import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const onboarding = useOnboardingStatus();

  if (loading || onboarding.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    const safeNext = next && next !== "/auth" ? `?next=${encodeURIComponent(next)}` : "";
    return <Navigate to={`/auth${safeNext}`} replace />;
  }

  // If user has no org or no team, redirect to onboarding (unless already there)
  const isOnboarding = location.pathname === "/onboarding";
  if ((!onboarding.hasOrg || !onboarding.hasTeam) && !isOnboarding) {
    const next = `${location.pathname}${location.search}`;
    const safeNext = next && next !== "/onboarding" ? `?next=${encodeURIComponent(next)}` : "";
    return <Navigate to={`/onboarding${safeNext}`} replace />;
  }

  return <>{children}</>;
}
