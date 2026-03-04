import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, X, Target, AlertTriangle, Trophy, Lightbulb, Scale, TrendingUp, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";

interface FocusRecommendationsProps {
  memberId: string;
  teamId: string;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  focus_suggestion: { icon: Target, color: "text-primary", bgColor: "bg-primary/10" },
  blocker_alert: { icon: AlertTriangle, color: "text-destructive", bgColor: "bg-destructive/10" },
  carry_over_warning: { icon: TrendingUp, color: "text-warning-foreground", bgColor: "bg-warning/10" },
  workload_balance: { icon: Scale, color: "text-muted-foreground", bgColor: "bg-muted" },
  pattern_insight: { icon: Lightbulb, color: "text-primary", bgColor: "bg-primary/10" },
  celebration: { icon: Trophy, color: "text-success", bgColor: "bg-success/10" },
};

export default function FocusRecommendations({ memberId, teamId }: FocusRecommendationsProps) {
  const queryClient = useQueryClient();
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "up" | "down">>({});

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ["focus-recommendations", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("focus_recommendations")
        .select("*")
        .eq("member_id", memberId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!memberId,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("focus_recommendations")
        .update({ is_dismissed: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["focus-recommendations", memberId] });
    },
  });

  const handleFeedback = (id: string, type: "up" | "down") => {
    setFeedbackMap(prev => ({ ...prev, [id]: type }));
    toast.success(type === "up" ? "Glad that helped!" : "We'll refine our suggestions");
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1 text-xs">
          <Sparkles className="h-3 w-3" />
          AI-powered suggestions
        </Badge>
      </div>

      {recommendations.map((rec) => {
        const config = typeConfig[rec.recommendation_type] || typeConfig.focus_suggestion;
        const Icon = config.icon;
        const fb = feedbackMap[rec.id];

        return (
          <Card key={rec.id} className={`${config.bgColor} border-none`}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className={`mt-0.5 ${config.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{rec.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => handleFeedback(rec.id, "up")}
                  disabled={fb !== undefined}
                >
                  <ThumbsUp className={`h-3 w-3 ${fb === "up" ? "text-primary" : ""}`} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => handleFeedback(rec.id, "down")}
                  disabled={fb !== undefined}
                >
                  <ThumbsDown className={`h-3 w-3 ${fb === "down" ? "text-destructive" : ""}`} />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  onClick={() => dismissMutation.mutate(rec.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
