import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALL_BADGES } from "@/lib/activity-badges";
import { useState } from "react";

interface BadgePickerProps {
  children: React.ReactNode;
  onSelect: (badgeKey: string) => void;
}

export function BadgePicker({ children, onSelect }: BadgePickerProps) {
  const [open, setOpen] = useState(false);
  const badges = Object.values(ALL_BADGES);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">Override badge</p>
        <div className="grid grid-cols-3 gap-1">
          {badges.map((badge) => (
            <button
              key={badge.key}
              onClick={() => {
                onSelect(badge.key);
                setOpen(false);
              }}
              className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-accent text-left"
            >
              <span>{badge.emoji}</span>
              <span className="truncate">{badge.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
