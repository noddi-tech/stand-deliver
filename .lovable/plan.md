

# Improve Team Feed: Style Commitment Status Tags

## Problem
Standup items display raw status text like `→ active`, `→ in_progress`, `→ done` as plain strings. This looks unpolished and hard to scan — especially `in_progress` with its underscore.

## Solution
Parse the `→ status` suffix from each bullet item and render it as a styled badge chip instead of raw text.

## Changes

### `src/pages/TeamFeed.tsx`

1. Add a helper function that splits an item like `"fix standup UX → active"` into `{ text: "fix standup UX", status: "active" }` and normalizes `in_progress` to `In Progress`, `done` to `Done`, `active` to `Active`, `carried` to `Carried`.

2. Replace the plain `<li>• {item}</li>` rendering in both Resolved and Focusing sections with:
   - The item text (without the status suffix)
   - A small colored `<Badge>` for the status:
     - `done` → green badge
     - `active` → blue/default badge
     - `in_progress` → amber/yellow badge
     - `carried` → orange badge
     - `blocked` → red badge

3. Items without a `→` suffix render unchanged (no badge).

### Visual result
```text
Before:  • fix standup UX in StandFlow → active
After:   • fix standup UX in StandFlow  [Active]
                                         ^^^^^^^^ styled blue badge
```

One file changed, no logic changes to data fetching.

