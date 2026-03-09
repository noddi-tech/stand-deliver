import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Key,
  Link2,
  Loader2,
  SquareKanban,
  Unplug,
  UserCheck,
  Users,
} from "lucide-react";

interface ClickUpMember {
  id: string;
  username: string;
  email: string;
  name: string;
  avatar: string | null;
}

interface ClickUpSectionProps {
  orgId: string | undefined;
}

export function ClickUpSection({ orgId }: ClickUpSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [step, setStep] = useState<"token" | "mapping" | "done">("token");
  const [clickupMembers, setClickupMembers] = useState<ClickUpMember[]>([]);

  // Fetch existing installation
  const { data: installation, isLoading: loadingInstall } = useQuery({
    queryKey: ["clickup-installation", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clickup_installations")
        .select("id, org_id, clickup_team_id, clickup_team_name, installed_at, installed_by")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch team members for mapping
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-clickup", orgId],
    queryFn: async () => {
      const { data: teams } = await supabase
        .from("teams")
        .select("id")
        .eq("org_id", orgId!)
        .limit(1)
        .single();
      if (!teams) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, user_id, profiles(full_name, avatar_url)")
        .eq("team_id", teams.id)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!orgId,
  });

  // Fetch existing clickup mappings
  const { data: clickupMappings } = useQuery({
    queryKey: ["clickup-mappings", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clickup_user_mappings")
        .select("*")
        .eq("org_id", orgId!);
      return data || [];
    },
    enabled: !!orgId && !!installation,
  });

  // Set step based on installation state
  useEffect(() => {
    if (installation) {
      setStep("mapping");
    } else {
      setStep("token");
    }
  }, [installation]);

  // Load members when installation exists
  useEffect(() => {
    if (!installation || !orgId) return;
    supabase.functions
      .invoke("clickup-setup", { body: { org_id: orgId, action: "list-members" } })
      .then(({ data }) => {
        if (data?.members) setClickupMembers(data.members);
      });
  }, [installation, orgId]);

  const handleConnect = async () => {
    if (!apiToken.trim() || !orgId) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("clickup-setup", {
        body: { org_id: orgId, api_token: apiToken.trim() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Connected to ClickUp workspace: ${data.selected_team.name} 🎉`);
      setClickupMembers(data.members || []);
      setApiToken("");
      queryClient.invalidateQueries({ queryKey: ["clickup-installation"] });
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect ClickUp");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!orgId) return;
    setDisconnecting(true);
    try {
      await supabase.functions.invoke("clickup-setup", {
        body: { org_id: orgId, action: "disconnect" },
      });
      queryClient.invalidateQueries({ queryKey: ["clickup-installation"] });
      queryClient.invalidateQueries({ queryKey: ["clickup-mappings"] });
      setStep("token");
      toast.success("ClickUp disconnected");
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const saveMapping = useMutation({
    mutationFn: async ({
      userId,
      clickupMemberId,
      displayName,
    }: {
      userId: string;
      clickupMemberId: string;
      displayName: string;
    }) => {
      const { error } = await supabase.from("clickup_user_mappings").upsert(
        {
          org_id: orgId!,
          user_id: userId,
          clickup_member_id: clickupMemberId,
          clickup_display_name: displayName,
        },
        { onConflict: "user_id,org_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clickup-mappings"] });
      toast.success("ClickUp mapping saved");
    },
    onError: () => toast.error("Failed to save mapping"),
  });

  const getMappingForUser = (userId: string) =>
    clickupMappings?.find((m: any) => m.user_id === userId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#7B68EE]">
              <SquareKanban className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">ClickUp</CardTitle>
              <CardDescription>
                Import assigned tasks as standup focus items.
              </CardDescription>
            </div>
          </div>
          {installation ? (
            <Badge className="bg-success/20 text-success border-success/30">
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingInstall ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Checking connection...</span>
          </div>
        ) : step === "token" && !installation ? (
          <div className="space-y-4">
            {/* Setup instructions */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                How to get your ClickUp API Token
              </h4>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                  Open{" "}
                  <a
                    href="https://app.clickup.com/settings/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    ClickUp Settings → Apps
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Click <strong>Generate</strong> under "API Token"</li>
                <li>
                  Copy the token (starts with <code className="text-xs bg-muted px-1 py-0.5 rounded">pk_</code>)
                </li>
                <li>Paste it below</li>
              </ol>
            </div>

            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="pk_..."
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                className="flex-1"
              />
              <Button
                onClick={handleConnect}
                disabled={connecting || !apiToken.trim()}
                className="gap-2"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="h-4 w-4" />
                )}
                Connect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected state */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Workspace:</span>
                <span className="font-medium text-foreground">
                  {installation?.clickup_team_name || "Unknown"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Disconnect
              </Button>
            </div>

            {/* User mapping table */}
            {teamMembers && teamMembers.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  User Mapping
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>ClickUp Account</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member: any) => {
                      const isCurrentUser = member.user_id === user?.id;
                      const mapping = getMappingForUser(member.user_id);
                      const linkedMember = clickupMembers.find(
                        (cm) => cm.id === mapping?.clickup_member_id
                      );

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {member.profiles?.full_name || "Unknown"}
                              {isCurrentUser && (
                                <Badge variant="outline" className="text-xs">
                                  You
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {mapping ? (
                              <div className="flex items-center gap-2">
                                {linkedMember?.avatar && (
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={linkedMember.avatar} />
                                    <AvatarFallback className="text-xs">
                                      {linkedMember.name?.[0] || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                )}
                                <span className="text-sm text-foreground">
                                  {linkedMember?.name ||
                                    mapping.clickup_display_name ||
                                    mapping.clickup_member_id}
                                </span>
                              </div>
                            ) : (
                              <Select
                                onValueChange={(value) => {
                                  const cm = clickupMembers.find(
                                    (m) => m.id === value
                                  );
                                  saveMapping.mutate({
                                    userId: member.user_id,
                                    clickupMemberId: value,
                                    displayName: cm?.name || value,
                                  });
                                }}
                              >
                                <SelectTrigger className="max-w-[240px] h-8 text-sm">
                                  <SelectValue placeholder="Select ClickUp user..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {clickupMembers.map((cm) => (
                                    <SelectItem key={cm.id} value={cm.id}>
                                      <span className="flex items-center gap-2">
                                        {cm.name}
                                        {cm.email && (
                                          <span className="text-muted-foreground text-xs">
                                            ({cm.email})
                                          </span>
                                        )}
                                      </span>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {mapping ? (
                              <Badge className="bg-success/20 text-success border-success/30 text-xs gap-1">
                                <UserCheck className="h-3 w-3" />
                                Linked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground text-xs"
                              >
                                Unlinked
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
