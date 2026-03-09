import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SlackPreview } from "./SlackPreview";
import { toast } from "sonner";
import { Hash, Link2, Loader2, Unplug, UserCheck, Zap } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  email: string | null;
  avatar: string | null;
}

export function IntegrationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [slackClientId, setSlackClientId] = useState<string | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);

  // Fetch Slack client ID from edge function
  useEffect(() => {
    supabase.functions.invoke("get-slack-config").then(({ data }) => {
      if (data?.client_id) setSlackClientId(data.client_id);
    });
  }, []);

  useEffect(() => {
    const slackStatus = searchParams.get("slack");
    if (slackStatus === "connected") {
      toast.success("Slack workspace connected successfully! 🎉");
      queryClient.invalidateQueries({ queryKey: ["slack-installation"] });
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
    } else if (slackStatus === "error") {
      toast.error("Failed to connect Slack. Please try again.");
      window.history.replaceState({}, "", window.location.pathname + "?tab=integrations");
    }
  }, [searchParams, queryClient]);

  // Fetch user's org
  const { data: orgMembership } = useQuery({
    queryKey: ["org-membership", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("org_id, organizations(id, name)")
        .eq("user_id", user!.id)
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const orgId = orgMembership?.org_id;

  // Fetch user's team (for channel linking)
  const { data: userTeam } = useQuery({
    queryKey: ["user-team", user?.id],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .limit(1)
        .single();
      if (!membership) return null;
      const { data: team } = await supabase
        .from("teams")
        .select("id, slack_channel_id")
        .eq("id", membership.team_id)
        .single();
      return team;
    },
    enabled: !!user,
  });

  // Fetch slack installation
  const { data: slackInstallation, isLoading: loadingInstallation } = useQuery({
    queryKey: ["slack-installation", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slack_installations")
        .select("*")
        .eq("org_id", orgId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch channels via edge function
  const { data: channels } = useQuery({
    queryKey: ["slack-channels", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-list-channels", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      return data?.channels || [];
    },
    enabled: !!slackInstallation,
  });

  // Fetch Slack workspace users
  const { data: slackUsers } = useQuery<SlackUser[]>({
    queryKey: ["slack-workspace-users", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-lookup-users", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      return data?.users || [];
    },
    enabled: !!slackInstallation,
  });

  // Fetch team members with mappings
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-for-mapping", orgId],
    queryFn: async () => {
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("org_id", orgId!)
        .limit(1)
        .single();
      if (!teams) return [];

      const { data, error } = await supabase
        .from("team_members")
        .select("id, user_id, slack_user_id, profiles(full_name, avatar_url)")
        .eq("team_id", teams.id)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
  });

  // Auto-link all unlinked members on page load
  const autoLinkRan = useRef(false);
  useEffect(() => {
    if (autoLinkRan.current || !slackInstallation || !teamMembers || !orgId) return;
    const unlinked = teamMembers.filter((m: any) => !m.slack_user_id && m.user_id);
    if (unlinked.length === 0) return;
    autoLinkRan.current = true;

    Promise.allSettled(
      unlinked.map((m: any) =>
        supabase.functions.invoke("slack-auto-link", {
          body: { org_id: orgId, member_id: m.id, user_id: m.user_id },
        })
      )
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ["team-members-for-mapping"] });
    });
  }, [slackInstallation, teamMembers, orgId, queryClient]);

  // Auto-link current user's Slack account
  const autoLink = useMutation({
    mutationFn: async ({ memberId, userId }: { memberId: string; userId: string }) => {
      const { data, error } = await supabase.functions.invoke("slack-auto-link", {
        body: { org_id: orgId, member_id: memberId, user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["team-members-for-mapping"] });
      toast.success(`Linked to Slack as ${data.display_name} ✅`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Update slack user ID mapping via edge function (for other members)
  const updateMapping = useMutation({
    mutationFn: async ({ memberId, slackUserId }: { memberId: string; slackUserId: string }) => {
      // Use the auto-link edge function with service role to bypass RLS
      const { data, error } = await supabase.functions.invoke("slack-auto-link", {
        body: { 
          org_id: orgId, 
          member_id: memberId, 
          user_id: teamMembers?.find(m => m.id === memberId)?.user_id,
          slack_user_id_override: slackUserId 
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members-for-mapping"] });
      toast.success("Slack mapping updated");
    },
    onError: () => toast.error("Failed to update mapping"),
  });

  const handleConnectSlack = () => {
    if (!orgId) {
      toast.error("You need to be part of an organization first.");
      return;
    }
    if (!slackClientId) {
      toast.error("Slack Client ID is not configured. Check your Supabase secrets.");
      return;
    }
    const scopes = "app_mentions:read,chat:write,chat:write.public,commands,im:write,im:read,im:history,users:read,users:read.email,channels:read,groups:read";
    const redirectUri = `${SUPABASE_URL}/functions/v1/slack-oauth-callback`;
    const url = `https://slack.com/oauth/v2/authorize?client_id=${slackClientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${orgId}`;
    window.open(url, "_blank", "width=600,height=700");
  };

  return (
    <div className="space-y-6">
      {/* Slack Connection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A154B]">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                </svg>
              </div>
              <div>
                <CardTitle className="text-base">Slack</CardTitle>
                <CardDescription>Send standup reminders and collect responses via Slack.</CardDescription>
              </div>
            </div>
            {slackInstallation ? (
              <Badge className="bg-success/20 text-success border-success/30">Connected</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingInstallation ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Checking connection...</span>
            </div>
          ) : slackInstallation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Workspace:</span>
                <span className="font-medium text-foreground">{slackInstallation.workspace_name}</span>
              </div>
              {channels && channels.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    Default Channel
                  </label>
                  <Select
                    value={userTeam?.slack_channel_id || ""}
                    onValueChange={async (channelId) => {
                      if (!userTeam?.id) return;
                      setSavingChannel(true);
                      const { error } = await supabase
                        .from("teams")
                        .update({ slack_channel_id: channelId })
                        .eq("id", userTeam.id);
                      setSavingChannel(false);
                      if (error) {
                        toast.error("Failed to update channel");
                      } else {
                        queryClient.invalidateQueries({ queryKey: ["user-team"] });
                        const chName = channels.find((c: any) => c.id === channelId)?.name;
                        toast.success(`Standup summaries will post to #${chName}`);
                      }
                    }}
                    disabled={savingChannel}
                  >
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select a channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((ch: { id: string; name: string }) => (
                        <SelectItem key={ch.id} value={ch.id}>#{ch.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <Button onClick={handleConnectSlack} className="gap-2">
              <Unplug className="h-4 w-4" />
              Connect to Slack
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Slack User Mapping */}
      {slackInstallation && teamMembers && teamMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Slack User Mapping</CardTitle>
            <CardDescription>Link team members to their Slack accounts for DM reminders.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Slack Account</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member: any) => {
                  const isCurrentUser = member.user_id === user?.id;
                  const isLinked = !!member.slack_user_id;
                  const linkedSlackUser = slackUsers?.find(su => su.id === member.slack_user_id);

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {member.profiles?.full_name || "Unknown"}
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isLinked ? (
                          <div className="flex items-center gap-2">
                            {linkedSlackUser && (
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={linkedSlackUser.avatar || undefined} />
                                <AvatarFallback className="text-xs">
                                  {linkedSlackUser.real_name?.[0] || "?"}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span className="text-sm text-foreground">
                              {linkedSlackUser?.real_name || member.slack_user_id}
                            </span>
                          </div>
                        ) : isCurrentUser ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled={autoLink.isPending}
                            onClick={() => autoLink.mutate({ memberId: member.id, userId: user!.id })}
                          >
                            {autoLink.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            Link My Account
                          </Button>
                        ) : (
                          <Select
                            onValueChange={(value) =>
                              updateMapping.mutate({ memberId: member.id, slackUserId: value })
                            }
                          >
                            <SelectTrigger className="max-w-[240px] h-8 text-sm">
                              <SelectValue placeholder="Select Slack user..." />
                            </SelectTrigger>
                            <SelectContent>
                              {slackUsers?.map((su) => (
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
                        )}
                      </TableCell>
                      <TableCell>
                        {isLinked ? (
                          <Badge className="bg-success/20 text-success border-success/30 text-xs gap-1">
                            <UserCheck className="h-3 w-3" />
                            Linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">Unlinked</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Slack Preview */}
      <SlackPreview />
    </div>
  );
}
