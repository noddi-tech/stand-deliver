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
