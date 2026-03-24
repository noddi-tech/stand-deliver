

# Fix Team Feed: Separate Done Items from Carried/Active

## Problem
When submitting a standup, `yesterday_text` stores ALL previous commitments with their status (`→ done`, `→ active`, `→ in_progress`, etc.). The Team Feed renders everything under a single "Resolved" header, so items marked done with the checkmark are mixed in with active/in_progress items. This makes it look like done items aren't showing — they're there but buried among non-done items under a misleading label.

## Solution
Split `yesterdayItems` into two groups based on parsed status:
- **Completed** (status = `done` or `dropped`) — shown with a checkmark icon header
- **Carried forward** (status = `active`, `in_progress`, `carried`) — shown with a separate "Carried" header

Items without a status suffix stay under "Completed" (backward compat).

## Changes

### `src/pages/TeamFeed.tsx`

1. After parsing `yesterdayItems`, split into two arrays using existing `parseItemStatus`:
   - `completedItems` — where status is `done`, `dropped`, or undefined (no arrow)
   - `carriedItems` — where status is `active`, `in_progress`, `carried`, `blocked`

2. Render two sub-sections instead of one:
   - **"Completed"** with `CheckCircle2` icon (green) — only truly finished items
   - **"Carried forward"** with a rotate/refresh icon — items still in progress

3. Hide either section if its array is empty.

## Visual result
```text
Before:
  ✓ Resolved
    • fix standup UX  [Active]
    • Draw up floor plans  [Active]
    • Bugfixing in SupportHub  [In Progress]

After:
  ✓ Completed
    • (items with done/dropped status shown here)

  ↻ Carried forward
    • fix standup UX  [Active]
    • Draw up floor plans  [Active]
    • Bugfixing in SupportHub  [In Progress]
```

One file changed, rendering logic only.

