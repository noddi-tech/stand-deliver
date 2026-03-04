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

  if (!user) return <Navigate to="/auth" replace />;

  // If user has no org or no team, redirect to onboarding (unless already there)
  const isOnboarding = location.pathname === "/onboarding";
  if ((!onboarding.hasOrg || !onboarding.hasTeam) && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
