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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
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
        setSession(newSession);
        setLoading(false);
      }
    );

    // 2. Hydrate: if URL has OAuth hash, let onAuthStateChange handle it
    const hasOAuthHash = window.location.hash.includes("access_token");
    if (!hasOAuthHash) {
      supabase.auth.getSession().then(async ({ data: { session: localSession } }) => {
        if (localSession) {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
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

  // In dev mode with no session, show the DevUserPicker instead of children
  const showDevPicker = import.meta.env.DEV && !loading && !session;

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
      {showDevPicker ? <DevUserPickerLazy /> : children}
    </AuthContext.Provider>
  );
}

// Lazy import to avoid bundling DevUserPicker in production
function DevUserPickerLazy() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    import("@/components/DevUserPicker").then((mod) => {
      setComponent(() => mod.default);
    });
  }, []);

  if (!Component) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <Component />;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
