import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithSlack: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Dev-mode mock user so the sandbox preview works without Slack OAuth
const DEV_MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@standflow.local",
  app_metadata: {},
  user_metadata: { full_name: "Dev User" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

const DEV_MOCK_SESSION = {
  access_token: "dev-token",
  refresh_token: "dev-refresh",
  expires_in: 999999,
  token_type: "bearer",
  user: DEV_MOCK_USER,
} as unknown as Session;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Dev bypass — skip all Supabase auth in sandbox
  if (import.meta.env.DEV) {
    return (
      <AuthContext.Provider
        value={{
          session: DEV_MOCK_SESSION,
          user: DEV_MOCK_USER,
          loading: false,
          signInWithSlack: async () => {},
          signOut: async () => {},
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Subscribe to auth changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === "SIGNED_OUT" || !newSession) {
          setSession(null);
          setLoading(false);
          return;
        }
        // For SIGNED_IN / TOKEN_REFRESHED — trust the event session
        setSession(newSession);
        setLoading(false);
      }
    );

    // 2. Hydrate: if URL has OAuth hash, let onAuthStateChange handle it
    const hasOAuthHash = window.location.hash.includes("access_token");
    if (!hasOAuthHash) {
      // Validate the local session against the server
      supabase.auth.getSession().then(async ({ data: { session: localSession } }) => {
        if (localSession) {
          // Verify the user actually exists server-side
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            // Stale/invalid session — clear it
            await supabase.auth.signOut();
            setSession(null);
          } else {
            setSession(localSession);
          }
        }
        setLoading(false);
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  const signInWithSlack = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "slack_oidc" as any,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signInWithSlack,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
