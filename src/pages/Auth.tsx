import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, ArrowRight, Loader2 } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    const { error } = await signInWithMagicLink(email);
    setSubmitting(false);
    if (error) {
      toast.error("Failed to send magic link. Please try again.");
    } else {
      setSent(true);
      toast.success("Magic link sent! Check your email.");
    }
  };

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
              Enter your email to receive a magic link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center space-y-3 py-4">
                <Mail className="mx-auto h-10 w-10 text-primary" />
                <p className="text-sm text-muted-foreground">
                  We sent a link to <span className="font-medium text-foreground">{email}</span>.
                  <br />Check your inbox and click the link to sign in.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSent(false)}
                >
                  Use a different email
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="transition-all duration-150"
                />
                <Button
                  type="submit"
                  className="w-full gap-2 transition-all duration-150"
                  disabled={submitting || !email}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continue with Email
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
