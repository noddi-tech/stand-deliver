

# Fix: Two-Row Button Grid on Mobile

## Problem
The four resolution buttons overflow horizontally on mobile, causing a horizontal scroll — "Drop" is cut off in the screenshot.

## Change

**`src/pages/MyStandup.tsx` (line 1013)**

Change the button container from `flex gap-1` to a 2×2 grid on mobile, single row on desktop:

```tsx
<div className="grid grid-cols-2 sm:flex gap-1 sm:shrink-0">
```

This gives a clean 2×2 layout on mobile (Done/Carry on top, Blocked/Drop below) and keeps the single horizontal row on `sm:` and up. No other changes needed.

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Line 1013: `flex gap-1 sm:shrink-0` → `grid grid-cols-2 sm:flex gap-1 sm:shrink-0` |

