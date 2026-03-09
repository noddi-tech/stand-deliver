import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Loader2, Send, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Member {
  id: string;
  user_id: string;
  role: "lead" | "member";
  is_active: boolean;
  full_name: string | null;
  avatar_url: string | null;
}

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  email: string | null;
  avatar: string | null;
}

interface SlackInvite {
  id: string;
  slack_user_id: string;
  slack_display_name: string | null;
  status: string;
  created_at: string;
}

export function MembersTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isLead, setIsLead] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedSlackUser, setSelectedSlackUser] = useState<string>("");
  const [sendingInvite, setSendingInvite] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchMembers();
  }, [user]);

  const fetchMembers = async () => {
    if (!user) return;

    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id, role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!membership) { setLoading(false); return; }

    setTeamId(membership.team_id);
    setIsLead(membership.role === "lead");

    const { data: team } = await supabase
      .from("teams")
      .select("org_id")
      .eq("id", membership.team_id)
      .single();
    if (team) setOrgId(team.org_id);

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("id, user_id, role, is_active, profile:profiles!inner(full_name, avatar_url)")
      .eq("team_id", membership.team_id);

    if (teamMembers) {
      setMembers(
        teamMembers.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          is_active: m.is_active,
          full_name: m.profile?.full_name || null,
          avatar_url: m.profile?.avatar_url || null,
        }))
      );
    }
    setLoading(false);
  };

  // Check if Slack is connected
  const { data: slackInstallation } = useQuery({
    queryKey: ["slack-installation-members", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("slack_installations")
        .select("id")
        .eq("org_id", orgId!)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch Slack workspace users for invite picker
  const { data: slackUsers } = useQuery<SlackUser[]>({
    queryKey: ["slack-users-invite", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-lookup-users", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      return data?.users || [];
    },
    enabled: !!slackInstallation && !!orgId,
  });

  // Fetch pending invites
  const { data: pendingInvites = [], refetch: refetchInvites } = useQuery<SlackInvite[]>({
    queryKey: ["slack-invites", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slack_invites")
        .select("id, slack_user_id, slack_display_name, status, created_at")
        .eq("org_id", orgId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Filter out already-invited and existing members from dropdown
  const invitedSlackUserIds = new Set(pendingInvites.map((i) => i.slack_user_id));
  const availableSlackUsers = slackUsers?.filter((su) => {
    if (!su.email) return false; // exclude bots
    if (invitedSlackUserIds.has(su.id)) return false;
    return true;
  }) || [];

  const handleSendInvite = async () => {
    if (!selectedSlackUser || !orgId || !teamId || !user) return;
    setSendingInvite(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-send-invite", {
        body: { org_id: orgId, team_id: teamId, slack_user_id: selectedSlackUser, invited_by: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const invitedUser = slackUsers?.find((u) => u.id === selectedSlackUser);
      toast({ title: "Invite sent! 🎉", description: `DM sent to ${invitedUser?.real_name || "user"} on Slack.` });
      setSelectedSlackUser("");
      refetchInvites();
    } catch (e: any) {
      toast({ title: "Failed to send invite", description: e.message, variant: "destructive" });
    } finally {
      setSendingInvite(false);
    }
  };

  const updateRole = async (memberId: string, newRole: "lead" | "member") => {
    setUpdatingId(memberId);
    const { error } = await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error updating role", description: error.message, variant: "destructive" });
    } else {
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
      toast({ title: "Role updated" });
    }
    setUpdatingId(null);
  };

  const toggleActive = async (memberId: string, currentActive: boolean) => {
    setUpdatingId(memberId);
    const { error } = await supabase
      .from("team_members")
      .update({ is_active: !currentActive })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error updating status", description: error.message, variant: "destructive" });
    } else {
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, is_active: !currentActive } : m));
      toast({ title: !currentActive ? "Member activated" : "Member deactivated" });
    }
    setUpdatingId(null);
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
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
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? "s" : ""} on this team.
            {!isLead && " Only team leads can manage roles and status."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.user_id === user?.id;
                return (
                  <TableRow key={member.id} className={!member.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(member.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="font-medium text-sm">{member.full_name || "Unknown"}</span>
                          {isSelf && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isLead && !isSelf ? (
                        <Select
                          value={member.role}
                          onValueChange={(v) => updateRole(member.id, v as "lead" | "member")}
                          disabled={updatingId === member.id}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lead">Lead</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === "lead" ? "default" : "secondary"}>
                          {member.role === "lead" ? "Lead" : "Member"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isLead && !isSelf ? (
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={() => toggleActive(member.id, member.is_active)}
                          disabled={updatingId === member.id}
                        />
                      ) : (
                        <Badge variant={member.is_active ? "default" : "secondary"}>
                          {member.is_active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invites</CardTitle>
            <CardDescription>
              {pendingInvites.length} invite{pendingInvites.length !== 1 ? "s" : ""} awaiting sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {getInitials(invite.slack_display_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{invite.slack_display_name || invite.slack_user_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Pending</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite via Slack */}
      {slackInstallation && availableSlackUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invite via Slack</CardTitle>
            <CardDescription>
              Send a Slack DM to a teammate inviting them to sign in and join StandFlow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Select value={selectedSlackUser} onValueChange={setSelectedSlackUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Slack user to invite..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlackUsers.map((su) => (
                      <SelectItem key={su.id} value={su.id}>
                        <span className="flex items-center gap-2">
                          {su.real_name}
                          {su.email && (
                            <span className="text-muted-foreground text-xs">({su.email})</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleSendInvite}
                disabled={!selectedSlackUser || sendingInvite}
                className="gap-2"
              >
                {sendingInvite ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Invite
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
