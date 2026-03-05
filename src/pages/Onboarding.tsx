import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, X, MessageSquare, Building2, Users, Calendar, Mail, Check } from "lucide-react";

const STEPS = [
  { label: "Organization", icon: Building2 },
  { label: "Team", icon: Users },
  { label: "Schedule", icon: Calendar },
  { label: "Invite", icon: Mail },
  { label: "Slack", icon: MessageSquare },
];

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const onboardingStatus = useOnboardingStatus();

  // Determine initial step based on status
  const [step, setStep] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Slack workspace detection — check custom_claims, then user_metadata, then identity_data
  const customClaims = user?.user_metadata?.custom_claims;
  const identityData = user?.identities?.[0]?.identity_data;
  const slackWorkspaceId = 
    customClaims?.["https://slack.com/team_id"]
    ?? user?.user_metadata?.["https://slack.com/team_id"]
    ?? identityData?.["https://slack.com/team_id"]
    ?? null;
  const [slackWorkspaceName, setSlackWorkspaceName] = useState<string | null>(
    user?.user_metadata?.["https://slack.com/team_name"]
    ?? identityData?.["https://slack.com/team_name"]
    ?? null
  );
  const [showManualOrgInput, setShowManualOrgInput] = useState(false);

  useEffect(() => {
    if (!onboardingStatus.loading && !initialized) {
      if (onboardingStatus.hasOrg && onboardingStatus.hasTeam) {
        navigate("/dashboard", { replace: true });
        return;
      }
      if (onboardingStatus.hasOrg && !onboardingStatus.hasTeam) {
        setStep(1);
        setOrgId(onboardingStatus.orgId!);
      }
      setInitialized(true);
    }
  }, [onboardingStatus.loading, initialized]);

  // Fetch workspace name from Slack API if we have team_id but no name
  useEffect(() => {
    if (slackWorkspaceId && !slackWorkspaceName && session?.provider_token) {
      supabase.functions.invoke("slack-team-info", {
        body: { provider_token: session.provider_token, team_id: slackWorkspaceId },
      }).then(({ data }) => {
        if (data?.team_name) {
          setSlackWorkspaceName(data.team_name);
          if (!orgName) setOrgName(data.team_name);
        }
      });
    }
  }, [slackWorkspaceId, slackWorkspaceName, session?.provider_token]);

  // Pre-fill org name from Slack workspace
  useEffect(() => {
    if (slackWorkspaceName && !orgName) {
      setOrgName(slackWorkspaceName);
    }
  }, [slackWorkspaceName]);

  // Step 1 state
  const [orgName, setOrgName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Step 2 state
  const [teamName, setTeamName] = useState("");
  const [teamId, setTeamId] = useState<string>("");

  // Step 3 state
  const [selectedDays, setSelectedDays] = useState<string[]>(["mon", "tue", "wed", "thu", "fri"]);
  const [standupTime, setStandupTime] = useState("09:00");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [timerSeconds, setTimerSeconds] = useState(120);

  // Step 4 state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);

  if (onboardingStatus.loading || !initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim() || !user) return;
    setSaving(true);
    try {
      // Verify auth is valid before any DB call
      const { data: { user: verifiedUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !verifiedUser) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        navigate("/auth", { replace: true });
        return;
      }

      // Use RPC to create org + join atomically (bypasses RLS)
      const slug = slugify(orgName);
      const { data: newOrgId, error: rpcErr } = await supabase.rpc("create_org_and_join" as any, {
        p_name: orgName.trim(),
        p_slug: slug,
        p_slack_workspace_id: slackWorkspaceId || null,
      });
      if (rpcErr) throw rpcErr;

      setOrgId(newOrgId as string);
      setStep(1);
    } catch (e: any) {
      const msg = e?.code === "42501"
        ? "Your session is not authenticated. Please sign in with Slack again."
        : e.message;
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim() || !user || !orgId) return;
    setSaving(true);
    try {
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({ name: teamName.trim(), org_id: orgId })
        .select("id")
        .single();
      if (teamErr) throw teamErr;

      const { error: memErr } = await supabase
        .from("team_members")
        .insert({ team_id: team.id, user_id: user.id, role: "lead" });
      if (memErr) throw memErr;

      setTeamId(team.id);
      setStep(2);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!teamId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({
          standup_days: selectedDays,
          standup_time: standupTime,
          standup_timezone: timezone,
          timer_seconds_per_person: timerSeconds,
        })
        .eq("id", teamId);
      if (error) throw error;
      setStep(3);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddEmail = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (email && email.includes("@") && !inviteEmails.includes(email)) {
      setInviteEmails([...inviteEmails, email]);
      setInviteEmail("");
    }
  };

  const handleSendInvites = () => {
    toast({ title: "Invites queued", description: `${inviteEmails.length} invite(s) will be sent shortly.` });
    setStep(4);
  };

  const handleFinish = () => {
    toast({ title: "Welcome to StandFlow! 🎉", description: "Your workspace is ready." });
    navigate("/dashboard", { replace: true });
  };

  const timezones = (() => {
    try {
      return (Intl as any).supportedValuesOf("timeZone") as string[];
    } catch {
      return [timezone];
    }
  })();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Step indicator */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 pb-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-center">
                  {i > 0 && (
                    <div className={`h-0.5 flex-1 ${isDone ? "bg-primary" : "bg-border"}`} />
                  )}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isDone
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 ${isDone ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
                <span className={`text-xs ${isActive ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-start px-4 pt-6">
        {step === 0 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Create your organization</CardTitle>
              <CardDescription>
                {slackWorkspaceName && !showManualOrgInput
                  ? "We detected your Slack workspace. Use it as your organization?"
                  : "This is your workspace where teams collaborate."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {slackWorkspaceName && !showManualOrgInput ? (
                <>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <p className="text-sm text-muted-foreground">Slack workspace</p>
                    <p className="text-lg font-semibold">{slackWorkspaceName}</p>
                  </div>
                  <Button className="w-full" onClick={handleCreateOrg} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Use this workspace
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => setShowManualOrgInput(true)}
                  >
                    Use a different name
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Organization name</Label>
                    <Input
                      placeholder="e.g. Acme Engineering"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateOrg()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Your role</Label>
                    <Select value={userRole} onValueChange={setUserRole}>
                      <SelectTrigger><SelectValue placeholder="Select your role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="engineering_lead">Engineering Lead</SelectItem>
                        <SelectItem value="product_manager">Product Manager</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
                        <SelectItem value="designer">Designer</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleCreateOrg} disabled={!orgName.trim() || saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Create your first team</CardTitle>
              <CardDescription>Teams run daily standups together.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Team name</Label>
                <Input
                  placeholder="e.g. Backend Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateTeam()}
                />
              </div>
              <Button className="w-full" onClick={handleCreateTeam} disabled={!teamName.trim() || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Set standup schedule</CardTitle>
              <CardDescription>Choose when your team checks in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const active = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        onClick={() =>
                          setSelectedDays((prev) =>
                            active ? prev.filter((x) => x !== d.key) : [...prev, d.key]
                          )
                        }
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "border border-input bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input type="time" value={standupTime} onChange={(e) => setStandupTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timer per person: {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, "0")}</Label>
                <Slider
                  min={60}
                  max={300}
                  step={15}
                  value={[timerSeconds]}
                  onValueChange={([v]) => setTimerSeconds(v)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 min</span><span>5 min</span>
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveSchedule} disabled={selectedDays.length === 0 || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Invite your team</CardTitle>
              <CardDescription>You can always do this later from Settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="colleague@company.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                />
                <Button variant="outline" onClick={handleAddEmail} disabled={!inviteEmail.trim()}>
                  Add
                </Button>
              </div>
              {inviteEmails.length > 0 && (
                <ul className="space-y-1">
                  {inviteEmails.map((email) => (
                    <li key={email} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm">
                      {email}
                      <button onClick={() => setInviteEmails(inviteEmails.filter((e) => e !== email))}>
                        <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col gap-2">
                {inviteEmails.length > 0 && (
                  <Button className="w-full" onClick={handleSendInvites}>
                    Send {inviteEmails.length} invite{inviteEmails.length > 1 ? "s" : ""}
                  </Button>
                )}
                <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setStep(4)}>
                  Skip for now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card className="w-full">
            <CardHeader className="items-center text-center">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Connect Slack</CardTitle>
              <CardDescription>
                Send standup reminders and collect updates via DM — all without leaving Slack.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={() => {
                  toast({ title: "Slack connection", description: "Redirecting to Slack OAuth…" });
                  // Reuse Slack OAuth from settings — for now navigate to settings
                  navigate("/settings");
                }}
              >
                Connect Slack
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleFinish}>
                Skip for now
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
