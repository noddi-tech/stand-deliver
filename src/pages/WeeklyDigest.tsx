import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import HealthGauge from "@/components/analytics/HealthGauge";
import MetricCard from "@/components/analytics/MetricCard";
import { Sparkles, ArrowLeft, Target, AlertTriangle, TrendingUp, CheckCircle, Github, SquareKanban, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

function CrossPlatformCard({ activity }: { activity: Record<string, any> }) {
  const gh = activity?.github || {};
  const cu = activity?.clickup || {};
  const sf = activity?.standflow || {};

  const hasGithub = gh.commits > 0 || gh.prs_opened > 0;
  const hasClickup = cu.tasks_tracked > 0;
  const hasStandflow = sf.commitments_made > 0;

  if (!hasGithub && !hasClickup && !hasStandflow) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-5 w-5 text-primary" />
          Cross-Platform Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasStandflow && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">StandFlow</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sf.commitments_completed}/{sf.commitments_made} commitments completed · {sf.blockers_resolved} blockers resolved
                {sf.blockers_unresolved > 0 && ` · ${sf.blockers_unresolved} unresolved`}
              </p>
            </div>
          </div>
        )}

        {hasGithub && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#24292f]/10">
              <Github className="h-4 w-4 text-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">GitHub</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {gh.commits} commits · {gh.prs_opened} PRs opened · {gh.prs_merged} merged · {gh.reviews} reviews
              </p>
              {gh.top_repos?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {gh.top_repos.map((repo: string) => (
                    <Badge key={repo} variant="secondary" className="text-xs">
                      {repo}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {hasClickup && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#7B68EE]/10">
              <SquareKanban className="h-4 w-4 text-[#7B68EE]" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">ClickUp</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cu.tasks_completed}/{cu.tasks_tracked} tasks completed
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WeeklyDigest() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: membership } = useQuery({
    queryKey: ["my-membership", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("team_id, role, teams(name)")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: digest, isLoading } = useQuery({
    queryKey: ["weekly-digest", membership?.team_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_weekly_digests")
        .select("*")
        .eq("team_id", membership!.team_id)
        .order("week_start", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!membership?.team_id,
  });

  const triggerDigest = async () => {
    if (!membership?.team_id) return;
    try {
      const { error } = await supabase.functions.invoke("ai-weekly-digest", {
        body: { team_id: membership.team_id },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Digest error:", err);
    }
  };

  const recommendations = (digest?.ai_recommendations as any[]) || [];
  const workDist = (digest?.work_distribution as Record<string, number>) || {};
  const crossPlatform = (digest?.cross_platform_activity as Record<string, any>) || {};

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Weekly Digest</h1>
              <p className="text-sm text-muted-foreground">
                {(membership?.teams as any)?.name} · {digest ? `${digest.week_start} — ${digest.week_end}` : "Latest"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              AI-powered
            </Badge>
            {membership?.role === "lead" && (
              <Button variant="outline" size="sm" onClick={triggerDigest}>
                Refresh Digest
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
            </div>
            <Skeleton className="h-40 rounded-lg" />
          </div>
        ) : !digest ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-foreground">No digest yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Weekly digests are generated at the end of each week
              </p>
              {membership?.role === "lead" && (
                <Button className="mt-4" onClick={triggerDigest}>Generate Now</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Metrics row */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="flex items-center justify-center">
                <HealthGauge score={digest.health_score || 0} size={100} />
              </div>
              <MetricCard
                label="Completion Rate"
                value={`${digest.completion_rate || 0}%`}
                icon={<CheckCircle className="h-4 w-4 text-success" />}
              />
              <MetricCard
                label="Commitments"
                value={digest.total_commitments || 0}
                subtitle={`${digest.total_completed || 0} completed`}
                icon={<Target className="h-4 w-4 text-primary" />}
              />
              <MetricCard
                label="Blockers"
                value={digest.total_blocked || 0}
                subtitle={`${digest.total_carried || 0} carried over`}
                icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
              />
            </div>

            {/* AI Narrative */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Week in Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-foreground">{digest.ai_narrative}</p>
              </CardContent>
            </Card>

            {/* Cross-Platform Activity */}
            <CrossPlatformCard activity={crossPlatform} />

            {/* Work Distribution */}
            {Object.keys(workDist).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Work Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(workDist).map(([key, count]) => {
                      const total = Object.values(workDist).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize text-foreground">{key.replace("_", " ")}</span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recommendations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                      <Badge variant={rec.priority === "high" ? "destructive" : rec.priority === "medium" ? "default" : "secondary"} className="mt-0.5 text-xs">
                        {rec.priority}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-foreground">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
