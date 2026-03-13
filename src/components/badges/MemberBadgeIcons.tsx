import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MemberBadge, BadgeDefinition } from "@/hooks/useBadges";

interface MemberBadgeIconsProps {
  badges: MemberBadge[];
  lookup: Record<string, BadgeDefinition>;
  max?: number;
}

/** Inline badge emoji row for member cards / feed items */
export function MemberBadgeIcons({ badges, lookup, max = 4 }: MemberBadgeIconsProps) {
  if (!badges.length) return null;

  // Deduplicate
  const unique = new Map<string, MemberBadge>();
  for (const b of badges) {
    if (!unique.has(b.badge_id)) unique.set(b.badge_id, b);
  }
  const list = Array.from(unique.values()).slice(0, max);

  return (
    <TooltipProvider>
      <span className="inline-flex gap-0.5">
        {list.map((b) => {
          const def = lookup[b.badge_id];
          if (!def) return null;
          return (
            <Tooltip key={b.id}>
              <TooltipTrigger asChild>
                <span className="text-sm cursor-default">{def.emoji}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs font-medium">{def.name}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
        {unique.size > max && (
          <span className="text-[10px] text-muted-foreground self-center">+{unique.size - max}</span>
        )}
      </span>
    </TooltipProvider>
  );
}
