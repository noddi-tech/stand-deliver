import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlackPreview } from "./SlackPreview";
import { toast } from "sonner";
import { Hash, Link2, Loader2, Unplug } from "lucide-react";

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

export function IntegrationsTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const slackConnected = searchParams.get("slack") === "connected";

  useEffect(() => {
    if (slackConnected) {
      toast.success("Slack workspace connected successfully!");
    }
  }, [slackConnected]);

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

  // Update slack user ID mapping
  const updateMapping = useMutation({
    mutationFn: async ({ memberId, slackUserId }: { memberId: string; slackUserId: string }) => {
      const { error } = await supabase
        .from("team_members")
        .update({ slack_user_id: slackUserId || null })
        .eq("id", memberId);
      if (error) throw error;
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
    const scopes = "chat:write,commands,im:write,users:read,channels:read";
    const redirectUri = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/slack-oauth-callback`;
    const state = orgId;
    const url = `https://slack.com/oauth/v2/authorize?client_id=${import.meta.env.VITE_SLACK_CLIENT_ID || ""}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
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
                  <Select>
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
            <CardDescription>Link team members to their Slack user IDs for DM reminders.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Slack User ID</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.profiles?.full_name || "Unknown"}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="U01ABCDEF"
                        defaultValue={member.slack_user_id || ""}
                        className="max-w-[200px] h-8 text-sm"
                        onBlur={(e) =>
                          updateMapping.mutate({
                            memberId: member.id,
                            slackUserId: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {member.slack_user_id ? (
                        <Badge className="bg-success/20 text-success border-success/30 text-xs">Linked</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">Unlinked</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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
