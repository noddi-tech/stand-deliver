

# Widen Standup Layout + Responsive Commitment Buttons

## Problem
The standup page is capped at `max-w-3xl` (768px). On desktop there's plenty of room, but the commitment rows feel cramped — especially now that buttons have labels. On mobile (390px viewport), the buttons and text compete for space.

## Changes

### 1. Widen the page container
**`src/pages/MyStandup.tsx` (line 826)**
- Change `max-w-3xl` → `max-w-5xl` to use more horizontal space on desktop

### 2. Stack commitment rows on mobile
**`src/pages/MyStandup.tsx` (lines 983-1070)**

Change the commitment item layout from a single horizontal flex row to a responsive layout:
- **Desktop** (`sm:` and up): keep current side-by-side layout — title/badges on left, buttons on right
- **Mobile** (`< sm`): stack vertically — title/badges on top, buttons below as a full-width row

Specifically:
- Change the outer `flex items-center justify-between` to `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`
- Remove `shrink-0` from button group on mobile so buttons can spread
- Show button labels on all screen sizes (remove `hidden sm:inline` from the `<span>` elements) since there's now room with the stacked layout

## Files Changed

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Widen container to `max-w-5xl`, make commitment rows stack vertically on mobile with full-width buttons |

