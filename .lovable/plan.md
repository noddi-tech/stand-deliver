

# Redesign Activity Cards with Grid Layout

## Problem
On mobile (390px), the activity cards cram everything into a single horizontal row — source icon, avatar, truncated title, badge chip, metadata, and external link all fight for space. The title gets heavily truncated and the badge/timestamp info wraps awkwardly.

## Solution
Restructure each activity card's internal layout into a clean two-row grid:

**Row 1**: Avatar + Title + Badge chip (full width)
**Row 2**: Source icon + Member name + Activity type badge + Timestamp + External link

This gives the title more room to breathe and groups metadata logically.

## Changes

**File: `src/pages/Activity.tsx`** (lines 335-378)

Replace the current single-row `flex items-center` card layout with:

```
Row 1: flex items-start gap-2
  - Avatar (h-7 w-7)
  - Title (text-sm font-medium, no truncate on mobile or at least more room)
  - Badge chip (pushed right with ml-auto)

Row 2: flex items-center gap-2 text-[11px] text-muted-foreground
  - Source emoji
  - Member name
  - · Activity type badge
  - · Timestamp
  - External link (ml-auto)
```

Remove the source icon from the left side of row 1 (move it to row 2 metadata line). This reclaims ~28px on mobile. The avatar stays as the visual anchor.

| File | Change |
|------|--------|
| `src/pages/Activity.tsx` | Restructure card internals from single-row to two-row layout |

