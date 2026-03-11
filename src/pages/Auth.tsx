import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogOut, User } from "lucide-react";
import { isSandbox } from "@/lib/isSandbox";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const { user, loading, signInWithSlack, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const showSandboxLogin = isSandbox();

  async function handleSandboxLogin() {
    setSandboxLoading(true);
    setSandboxError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sandbox-origin": window.location.origin,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: "joachim@noddi.no", sandbox: true }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Impersonation failed");

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (otpError) throw new Error(otpError.message);
    } catch (err: any) {
      setSandboxError(err.message);
      setSandboxLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && !signingOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Redirecting…</p>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={async () => {
              setSigningOut(true);
              await signOut();
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out &amp; switch workspace
          </Button>
          <Navigate to="/dashboard" replace />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            StandFlow
          </h1>
          <p className="text-sm text-muted-foreground">
            Async standups. Persistent accountability.
          </p>
        </div>

        <Card className="border-border/50">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Continue with your Slack workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={signInWithSlack}
              className="w-full gap-3 transition-all duration-150"
            >
              <svg width="20" height="20" viewBox="0 0 54 54" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" fillRule="evenodd">
                  <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
                  <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
                  <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
                  <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.25m14.336-.001v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="#E01E5A"/>
                </g>
              </svg>
              Sign in with Slack
            </Button>

            {showSandboxLogin && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Sandbox</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={handleSandboxLogin}
                  disabled={sandboxLoading}
                  className="w-full gap-2 border-amber-500/50 text-foreground hover:bg-amber-500/10"
                >
                  {sandboxLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                  Continue as Joachim Rathke
                </Button>

                {sandboxError && (
                  <p className="text-xs text-destructive text-center">{sandboxError}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
