import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Bell, AlertTriangle, BarChart3, Info, Hash, AtSign } from "lucide-react";
import { Link } from "react-router-dom";

interface NotificationType {
  key: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  destination: "channel" | "dm";
}

const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: "standup_summary",
    title: "Standup Summary",
    description: "Posts a formatted summary of all responses to your Slack channel after the standup window closes.",
    icon: <MessageSquare className="h-5 w-5" />,
    destination: "channel",
  },
  {
    key: "daily_reminder",
    title: "Daily Standup Reminder",
    description: "Sends a DM to each team member at the scheduled standup time prompting them to submit their update.",
    icon: <Bell className="h-5 w-5" />,
    destination: "dm",
  },
  {
    key: "blocker_alert",
    title: "Blocker Alerts",
    description: "Posts a notification to the channel when a team member reports a new blocker during standup.",
    icon: <AlertTriangle className="h-5 w-5" />,
    destination: "channel",
  },
  {
    key: "weekly_digest",
    title: "Weekly Digest",
    description: "Posts an AI-generated weekly summary with trends, health score, and recommendations every Monday.",
    icon: <BarChart3 className="h-5 w-5" />,
    destination: "channel",
  },
];

export function NotificationsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [slackChannelName, setSlackChannelName] = useState<string | null>(null);
  const [hasSlack, setHasSlack] = useState(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      const tId = membership.team_id;
      setTeamId(tId);

      const [teamRes, prefsRes] = await Promise.all([
        supabase.from("teams").select("slack_channel_id, org_id").eq("id", tId).single(),
        supabase.from("notification_preferences").select("notification_type, enabled").eq("team_id", tId),
      ]);

      if (teamRes.data) {
        const orgId = teamRes.data.org_id;
        const channelId = teamRes.data.slack_channel_id;

        // Check if slack is connected
        const { data: installation } = await supabase
          .from("slack_installations")
          .select("id")
          .eq("org_id", orgId)
          .limit(1)
          .maybeSingle();
        setHasSlack(!!installation);

        // Fetch actual channel name if slack is connected and channel is set
        if (installation && channelId) {
          try {
            const { data: channelData } = await supabase.functions.invoke("slack-list-channels", {
              body: { org_id: orgId },
            });
            const match = channelData?.channels?.find((c: { id: string; name: string }) => c.id === channelId);
            setSlackChannelName(match ? `#${match.name}` : null);
          } catch {
            setSlackChannelName(null);
          }
        }
      }

      const prefsMap: Record<string, boolean> = {};
      NOTIFICATION_TYPES.forEach((n) => { prefsMap[n.key] = true; });
      if (prefsRes.data) {
        prefsRes.data.forEach((p: any) => {
          prefsMap[p.notification_type] = p.enabled;
        });
      }
      setPreferences(prefsMap);
      setLoading(false);
    })();
  }, [user]);

  const handleToggle = async (key: string, enabled: boolean) => {
    if (!teamId) return;
    setTogglingKey(key);
    setPreferences((prev) => ({ ...prev, [key]: enabled }));

    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { team_id: teamId, notification_type: key, enabled, updated_at: new Date().toISOString() },
        { onConflict: "team_id,notification_type" }
      );

    setTogglingKey(null);
    if (error) {
      setPreferences((prev) => ({ ...prev, [key]: !enabled }));
      toast({ title: "Failed to update preference", description: error.message, variant: "destructive" });
    }
  };

  const getDestinationLabel = (notif: NotificationType) => {
    if (notif.destination === "dm") return "DM to each member";
    if (slackChannelName) return slackChannelName;
    return "No channel set";
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!hasSlack && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Slack is not connected.{" "}
            <Link to="/settings?tab=integrations" className="font-medium text-primary underline underline-offset-4">
              Connect Slack
            </Link>{" "}
            to enable notifications.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Control what gets sent and where. All notifications require Slack to be connected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {NOTIFICATION_TYPES.map((notif) => (
            <div
              key={notif.key}
              className="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="mt-0.5 text-muted-foreground">{notif.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-foreground">{notif.title}</span>
                  <Badge variant="outline" className="text-xs font-normal gap-1">
                    {notif.destination === "channel" ? (
                      <Hash className="h-3 w-3" />
                    ) : (
                      <AtSign className="h-3 w-3" />
                    )}
                    {getDestinationLabel(notif)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{notif.description}</p>
              </div>
              <Switch
                checked={preferences[notif.key] ?? true}
                onCheckedChange={(checked) => handleToggle(notif.key, checked)}
                disabled={!hasSlack || togglingKey === notif.key}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
