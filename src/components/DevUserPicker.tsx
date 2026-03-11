import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Shield } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export default function DevUserPicker() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch profiles using service-role via edge function won't work here.
    // Instead, fetch profiles with anon key (profiles SELECT policy allows authenticated,
    // but we're not authenticated yet). We'll use the edge function to list users instead.
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      // Use a lightweight approach: call the dev-impersonate function with a "list" action
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-secret": "list",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "list" }),
        }
      );

      // If that doesn't work (403), fall back to hardcoded approach
      if (!res.ok) {
        // We can't list profiles without auth, so let user type an email
        setLoading(false);
        return;
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function handleImpersonate(email: string) {
    setSigningIn(email);
    setError(null);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-secret": import.meta.env.VITE_DEV_MODE_SECRET || "",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Impersonation failed");
      }

      // Use verifyOtp with the token hash
      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });

      if (otpError) {
        throw new Error(otpError.message);
      }

      // Session is now set — onAuthStateChange will pick it up
    } catch (err: any) {
      setError(err.message);
      setSigningIn(null);
    }
  }

  const [emailInput, setEmailInput] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-amber-500/50 bg-background">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-amber-500">
            <Shield className="h-5 w-5" />
            <CardTitle className="text-lg">Dev Mode — Impersonate User</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Sign in as any user to test with real data &amp; RLS policies.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              User email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="joachim@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && emailInput) handleImpersonate(emailInput);
                }}
              />
              <Button
                onClick={() => handleImpersonate(emailInput)}
                disabled={!emailInput || !!signingIn}
                className="gap-2"
              >
                {signingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                Sign in
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            This bypasses Slack OAuth for sandbox testing only. Set{" "}
            <code className="rounded bg-muted px-1">VITE_DEV_MODE_SECRET</code>{" "}
            in your <code className="rounded bg-muted px-1">.env</code> to match
            the edge function secret.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
