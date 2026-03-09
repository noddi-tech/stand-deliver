import { useState, useEffect } from "react";
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
  AlertTriangle,
  ExternalLink,
  Github,
  Key,
  Link2,
  Loader2,
  Unplug,
  UserCheck,
  Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface GitHubMember {
  login: string;
  avatar_url: string;
  id: number;
}

interface GitHubSectionProps {
  orgId: string | undefined;
}

export function GitHubSection({ orgId }: GitHubSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [apiToken, setApiToken] = useState("");
  const [githubOrgName, setGithubOrgName] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [step, setStep] = useState<"token" | "mapping">("token");
  const [githubMembers, setGithubMembers] = useState<GitHubMember[]>([]);

  const { data: installation, isLoading: loadingInstall } = useQuery({
    queryKey: ["github-installation", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("github_installations")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-github", orgId],
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

  const { data: githubMappings } = useQuery({
    queryKey: ["github-mappings", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("github_user_mappings")
        .select("*")
        .eq("org_id", orgId!);
      return data || [];
    },
    enabled: !!orgId && !!installation,
  });

  useEffect(() => {
    if (installation) setStep("mapping");
    else setStep("token");
  }, [installation]);

  const [memberFetchError, setMemberFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!installation || !orgId) return;
    setMemberFetchError(null);
    supabase.functions
      .invoke("github-setup", { body: { org_id: orgId, action: "list-members" } })
      .then(({ data }) => {
        if (data?.members) setGithubMembers(data.members);
        if (data?.members_error) setMemberFetchError(data.members_error);
      });
  }, [installation, orgId]);

  const handleConnect = async () => {
    if (!apiToken.trim() || !orgId) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("github-setup", {
        body: { org_id: orgId, api_token: apiToken.trim(), github_org_name: githubOrgName.trim() || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Connected to GitHub as ${data.username} 🎉`);
      setGithubMembers(data.members || []);
      setApiToken("");
      setGithubOrgName("");
      queryClient.invalidateQueries({ queryKey: ["github-installation"] });
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message || "Failed to connect GitHub");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!orgId) return;
    setDisconnecting(true);
    try {
      await supabase.functions.invoke("github-setup", {
        body: { org_id: orgId, action: "disconnect" },
      });
      queryClient.invalidateQueries({ queryKey: ["github-installation"] });
      queryClient.invalidateQueries({ queryKey: ["github-mappings"] });
      setStep("token");
      toast.success("GitHub disconnected");
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const saveMapping = useMutation({
    mutationFn: async ({ userId, githubUsername, displayName }: { userId: string; githubUsername: string; displayName: string }) => {
      const { error } = await supabase.from("github_user_mappings").upsert(
        {
          org_id: orgId!,
          user_id: userId,
          github_username: githubUsername,
          github_display_name: displayName,
        },
        { onConflict: "user_id,org_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-mappings"] });
      toast.success("GitHub mapping saved");
    },
    onError: () => toast.error("Failed to save mapping"),
  });

  const deleteMapping = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("github_user_mappings")
        .delete()
        .eq("user_id", userId)
        .eq("org_id", orgId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-mappings"] });
      toast.success("Mapping removed");
    },
    onError: () => toast.error("Failed to remove mapping"),
  });

  const getMappingForUser = (userId: string) =>
    githubMappings?.find((m: any) => m.user_id === userId);

  const getAvailableGithubMembers = (currentUserId: string) => {
    const mappedUsernames = (githubMappings || [])
      .filter((m: any) => m.user_id !== currentUserId && m.github_username !== "__none__")
      .map((m: any) => m.github_username);
    return githubMembers.filter((gm) => !mappedUsernames.includes(gm.login));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#24292f]">
              <Github className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">GitHub</CardTitle>
              <CardDescription>Track commits, PRs, and reviews in weekly digests.</CardDescription>
            </div>
          </div>
          {installation ? (
            <Badge className="bg-success/20 text-success border-success/30">Connected</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Not Connected</Badge>
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
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                How to get your GitHub Personal Access Token
              </h4>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                  Open{" "}
                  <a
                    href="https://github.com/settings/tokens?type=beta"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline inline-flex items-center gap-1"
                  >
                    GitHub Settings → Fine-grained tokens
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Click <strong>Generate new token</strong></li>
                <li>Select repositories (all or specific) and grant <strong>Read</strong> access to Contents, Pull requests, and <strong>Organization → Members</strong></li>
                <li>Copy the token and paste it below</li>
              </ol>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="github_pat_..."
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="flex-1"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="GitHub org name (optional)"
                  value={githubOrgName}
                  onChange={(e) => setGithubOrgName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                  className="flex-1"
                />
                <Button onClick={handleConnect} disabled={connecting || !apiToken.trim()} className="gap-2">
                  {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Connect
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Organization:</span>
                <span className="font-medium text-foreground">
                  {installation?.github_org_name || "Personal"}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Disconnect
              </Button>
            </div>

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
                      <TableHead>GitHub Account</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member: any) => {
                      const isCurrentUser = member.user_id === user?.id;
                      const mapping = getMappingForUser(member.user_id);
                      const linkedMember = githubMembers.find(
                        (gm) => gm.login === mapping?.github_username
                      );

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {member.profiles?.full_name || "Unknown"}
                              {isCurrentUser && <Badge variant="outline" className="text-xs">You</Badge>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {mapping ? (
                              <div className="flex items-center gap-2">
                                {mapping.github_username === "__none__" ? (
                                  <span className="text-sm text-muted-foreground italic">
                                    No GitHub account
                                  </span>
                                ) : (
                                  <>
                                    {linkedMember?.avatar_url && (
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={linkedMember.avatar_url} />
                                        <AvatarFallback className="text-xs">{linkedMember.login?.[0]}</AvatarFallback>
                                      </Avatar>
                                    )}
                                    <span className="text-sm text-foreground">
                                      @{mapping.github_username}
                                    </span>
                                  </>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => deleteMapping.mutate(member.user_id)}
                                >
                                  Change
                                </Button>
                              </div>
                            ) : (() => {
                              const available = getAvailableGithubMembers(member.user_id);
                              return (
                                <div className="flex items-center gap-2">
                                  <Select
                                    onValueChange={(value) => {
                                      if (value === "__none__") {
                                        saveMapping.mutate({
                                          userId: member.user_id,
                                          githubUsername: "__none__",
                                          displayName: "No GitHub account",
                                        });
                                      } else {
                                        const gm = githubMembers.find((m) => m.login === value);
                                        saveMapping.mutate({
                                          userId: member.user_id,
                                          githubUsername: value,
                                          displayName: gm?.login || value,
                                        });
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="max-w-[240px] h-8 text-sm">
                                      <SelectValue placeholder="Select GitHub user..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">
                                        <span className="text-muted-foreground">No GitHub account</span>
                                      </SelectItem>
                                      {available.map((gm) => (
                                        <SelectItem key={gm.login} value={gm.login}>
                                          <span className="flex items-center gap-2">
                                            @{gm.login}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {mapping ? (
                              mapping.github_username === "__none__" ? (
                                <Badge variant="outline" className="text-muted-foreground text-xs">N/A</Badge>
                              ) : (
                                <Badge className="bg-success/20 text-success border-success/30 text-xs gap-1">
                                  <UserCheck className="h-3 w-3" />
                                  Linked
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground text-xs">Unlinked</Badge>
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
