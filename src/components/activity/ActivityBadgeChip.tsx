import { ALL_BADGES } from "@/lib/activity-badges";

interface ActivityBadgeChipProps {
  badgeKey: string;
  onClick?: () => void;
}

export function ActivityBadgeChip({ badgeKey, onClick }: ActivityBadgeChipProps) {
  const badge = ALL_BADGES[badgeKey];
  if (!badge) return null;

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted/50 text-muted-foreground ${onClick ? "cursor-pointer hover:bg-muted" : ""}`}
    >
      {badge.emoji} {badge.label}
    </span>
  );
}
