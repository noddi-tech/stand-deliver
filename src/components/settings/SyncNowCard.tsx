import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export function SyncNowCard({ orgId }: { orgId: string }) {
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [syncingClickup, setSyncingClickup] = useState(false);

  const { data: githubInstall } = useQuery({
    queryKey: ["github-install-check", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("github_installations")
        .select("id")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  const { data: clickupInstall } = useQuery({
    queryKey: ["clickup-install-check", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clickup_installations")
        .select("id")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!orgId,
  });

  if (!githubInstall && !clickupInstall) return null;

  const handleSync = async (source: "github" | "clickup") => {
    const setter = source === "github" ? setSyncingGithub : setSyncingClickup;
    const fnName = source === "github" ? "github-sync-activity" : "clickup-sync-activity";
    setter(true);
    try {
      const { data, error } = await supabase.functions.invoke(fnName, { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`${source === "github" ? "GitHub" : "ClickUp"} activity synced! ✅`);
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally {
      setter(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Sync</CardTitle>
        <CardDescription>
          Manually trigger a sync to pull the latest activity from connected integrations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3">
          {githubInstall && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={syncingGithub}
              onClick={() => handleSync("github")}
            >
              {syncingGithub ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync GitHub
            </Button>
          )}
          {clickupInstall && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={syncingClickup}
              onClick={() => handleSync("clickup")}
            >
              {syncingClickup ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync ClickUp
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
