

# Add Labels + Tooltips to Commitment Resolution Buttons

## What Changes

In `src/pages/MyStandup.tsx` (~lines 1010-1042), update the four resolution buttons to show **icon + text label**, and wrap each in a `Tooltip` with a short explanation.

| Button | Icon | Label | Tooltip |
|--------|------|-------|---------|
| Done | `Check` | Done | "Mark as completed. This item won't carry forward to your next standup." |
| Carry | `ArrowRight` | Carry | "Still working on it. This item will carry forward to your next standup." |
| Blocked | `AlertTriangle` | Blocked | "Something is preventing progress. You'll be asked to describe the blocker." |
| Drop | `X` | Drop | "No longer relevant. This item will be removed from your active commitments." |

## Implementation

**`src/pages/MyStandup.tsx`**
- Import `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `@/components/ui/tooltip`
- Wrap the button group in `<TooltipProvider delayDuration={300}>`
- Each button becomes:
  ```tsx
  <Tooltip>
    <TooltipTrigger asChild>
      <Button size="sm" variant={...} className="h-7 px-2.5 text-xs">
        <Check className="h-3 w-3" />
        <span className="hidden sm:inline">Done</span>
      </Button>
    </TooltipTrigger>
    <TooltipContent>Mark as completed. This item won't carry forward.</TooltipContent>
  </Tooltip>
  ```
- Labels hidden on mobile (`hidden sm:inline`), tooltips work everywhere

**Single file change, ~40 lines modified.**

