import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Award } from "lucide-react";
import { useMemberBadges, useBadgeLookup } from "@/hooks/useBadges";
import { format } from "date-fns";

interface BadgeShowcaseProps {
  memberId: string | undefined;
  teamId: string | undefined;
  compact?: boolean;
}

export function BadgeShowcase({ memberId, teamId, compact = false }: BadgeShowcaseProps) {
  const { data: badges, isLoading } = useMemberBadges(memberId, teamId);
  const lookup = useBadgeLookup();

  if (isLoading) return compact ? null : <Skeleton className="h-24 w-full" />;
  if (!badges?.length) {
    if (compact) return null;
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <Award className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          No badges earned yet — keep shipping!
        </CardContent>
      </Card>
    );
  }

  // Deduplicate by badge_id (show most recent)
  const uniqueBadges = new Map<string, typeof badges[0]>();
  for (const b of badges) {
    if (!uniqueBadges.has(b.badge_id)) uniqueBadges.set(b.badge_id, b);
  }

  const badgeList = Array.from(uniqueBadges.values());

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex flex-wrap gap-1">
          {badgeList.slice(0, 5).map((b) => {
            const def = lookup[b.badge_id];
            if (!def) return null;
            return (
              <Tooltip key={b.id}>
                <TooltipTrigger asChild>
                  <span className="text-base cursor-default" title={def.name}>{def.emoji}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium text-xs">{def.name}</p>
                  <p className="text-[10px] text-muted-foreground">{def.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
          {badgeList.length > 5 && (
            <span className="text-[10px] text-muted-foreground self-center">+{badgeList.length - 5}</span>
          )}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" /> Badges Earned
        </CardTitle>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {badgeList.map((b) => {
              const def = lookup[b.badge_id];
              if (!def) return null;
              return (
                <Tooltip key={b.id}>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-default">
                      <span className="text-2xl">{def.emoji}</span>
                      <span className="text-xs font-medium text-foreground text-center leading-tight">{def.name}</span>
                      <span className="text-[10px] text-muted-foreground">{format(new Date(b.earned_at), "MMM d")}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs max-w-48">{def.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
