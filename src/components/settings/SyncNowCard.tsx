import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";

export function SyncNowCard({ orgId }: { orgId: string }) {
  const [syncingGithub, setSyncingGithub] = useState(false);
  const [syncingClickup, setSyncingClickup] = useState(false);
  const [githubProgress, setGithubProgress] = useState<{ done: number; total: number } | null>(null);

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

  const handleGithubSync = async () => {
    setSyncingGithub(true);
    setGithubProgress(null);
    let offset = 0;
    let totalUsers = 0;
    let allResults: any[] = [];

    try {
      while (true) {
        const { data, error } = await supabase.functions.invoke("github-sync-activity", {
          body: { days_back: 30, org_id: orgId, offset, limit_users: 2 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        totalUsers = data.total_users || 0;
        const processed = data.processed_users || 0;
        offset = data.next_offset || offset + processed;
        allResults = [...allResults, ...(data.results || [])];

        setGithubProgress({ done: Math.min(offset, totalUsers), total: totalUsers });

        if (!data.has_more) break;
      }
      toast.success(`GitHub synced! ${allResults.length} user(s) processed ✅`);
    } catch (e: any) {
      if (allResults.length > 0) {
        toast.error(`Sync failed after ${allResults.length} user(s): ${e.message}. Retry to continue.`);
      } else {
        toast.error(`Sync failed: ${e.message}`);
      }
    } finally {
      setSyncingGithub(false);
      setTimeout(() => setGithubProgress(null), 3000);
    }
  };

  const handleClickupSync = async () => {
    setSyncingClickup(true);
    try {
      const { data, error } = await supabase.functions.invoke("clickup-sync-activity", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("ClickUp activity synced! ✅");
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally {
      setSyncingClickup(false);
    }
  };

  const progressPercent = githubProgress
    ? githubProgress.total > 0
      ? Math.round((githubProgress.done / githubProgress.total) * 100)
      : 0
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity Sync</CardTitle>
        <CardDescription>
          Manually trigger a sync to pull the latest activity from connected integrations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-3">
          {githubInstall && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={syncingGithub}
              onClick={handleGithubSync}
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
              onClick={handleClickupSync}
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
        {syncingGithub && progressPercent !== null && (
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Synced {githubProgress!.done}/{githubProgress!.total} users…
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
