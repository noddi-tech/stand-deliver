import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Shield } from "lucide-react";

const SECRET_STORAGE_KEY = "dev-impersonate-secret";

export default function DevUserPicker() {
  const [emailInput, setEmailInput] = useState("");
  const [secretInput, setSecretInput] = useState(
    () => localStorage.getItem(SECRET_STORAGE_KEY) || ""
  );
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImpersonate() {
    if (!emailInput || !secretInput) return;
    setSigningIn(true);
    setError(null);

    // Persist secret for next time
    localStorage.setItem(SECRET_STORAGE_KEY, secretInput);

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dev-impersonate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-secret": secretInput,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ email: emailInput }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Impersonation failed");
      }

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });

      if (otpError) {
        throw new Error(otpError.message);
      }
      // Session set — onAuthStateChange handles the rest
    } catch (err: any) {
      setError(err.message);
      setSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-amber-500/50">
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
              Dev secret
            </label>
            <input
              type="password"
              placeholder="DEV_MODE_SECRET value"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

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
                  if (e.key === "Enter") handleImpersonate();
                }}
              />
              <Button
                onClick={handleImpersonate}
                disabled={!emailInput || !secretInput || signingIn}
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

          <p className="text-xs text-muted-foreground">
            Enter the value you set for <code className="rounded bg-muted px-1">DEV_MODE_SECRET</code> in
            Supabase edge function secrets. It's saved in localStorage for convenience.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
