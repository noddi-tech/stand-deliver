import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Loader2, Hash } from "lucide-react";

export function TeamTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [slackChannel, setSlackChannel] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Get user's active team membership
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (!membership) { setLoading(false); return; }

      // Fetch team with org
      const { data: team } = await supabase
        .from("teams")
        .select("id, name, org_id, slack_channel_id")
        .eq("id", membership.team_id)
        .single();

      if (!team) { setLoading(false); return; }

      setTeamId(team.id);
      setTeamName(team.name);
      setSlackChannel(team.slack_channel_id);
      setOrgId(team.org_id);

      // Fetch org name
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", team.org_id)
        .single();

      if (org) setOrgName(org.name);

      // Check if user is org owner/admin
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("role")
        .eq("org_id", team.org_id)
        .eq("user_id", user.id)
        .single();

      setIsOrgAdmin(orgMember?.role === "owner" || orgMember?.role === "admin");
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!teamId) return;
    setSaving(true);

    const { error: teamError } = await supabase
      .from("teams")
      .update({ name: teamName })
      .eq("id", teamId);

    if (teamError) {
      setSaving(false);
      toast({ title: "Error saving team", description: teamError.message, variant: "destructive" });
      return;
    }

    // Update org name if admin
    if (isOrgAdmin && orgId) {
      const { error: orgError } = await supabase
        .from("organizations")
        .update({ name: orgName })
        .eq("id", orgId);

      if (orgError) {
        setSaving(false);
        toast({ title: "Error saving organization", description: orgError.message, variant: "destructive" });
        return;
      }
    }

    setSaving(false);
    toast({ title: "Settings updated" });
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
    <Card>
      <CardHeader>
        <CardTitle>Team Settings</CardTitle>
        <CardDescription>Manage your team and organization details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="team-name">Team Name</Label>
          <Input
            id="team-name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-name">Organization Name</Label>
          <Input
            id="org-name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            disabled={!isOrgAdmin}
            className="max-w-sm"
          />
          {!isOrgAdmin && (
            <p className="text-xs text-muted-foreground">Only organization owners and admins can change this.</p>
          )}
        </div>

        {slackChannel && (
          <div className="space-y-2">
            <Label>Linked Slack Channel</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Hash className="h-4 w-4" />
              <span>{slackChannel}</span>
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !teamName.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Settings
        </Button>
      </CardContent>
    </Card>
  );
}
