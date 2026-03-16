

# Fix: Always-Accessible Standup with Add-Anytime Commitments

## Problem

The MyStandup page has three blocking gates that prevent users from managing their work:

1. **Off-day gate** (line 717-744): Returns a "No standup today" card and nothing else
2. **Physical meeting gate** (line 746-764): Returns a "Start Meeting" card and nothing else
3. **Submitted gate** (line 767-822): Shows a read-only summary with only an "Edit" button -- no way to add new items

In all three cases, users cannot view active commitments, mark things done, or add new focus items that came in during the day.

## Solution

Restructure the page so it always renders three sections:

1. **Info banner** (contextual) -- "No standup today", "Physical meeting day", or "Standup submitted" as a dismissible/informational banner at the top, not a full-page block
2. **Active commitments** (always visible) -- All open commitments with status controls (done, blocked, in-progress, dropped). Includes auto-resolved badge display.
3. **Add new commitment** (always visible) -- A compact "Add item" row so users can add new focus items at any time, even after submitting, on off-days, or on meeting days
4. **Standup form** (conditional) -- The mood picker, blocker text, and submit button only shown on async standup days when not yet submitted

## Changes

**`src/pages/MyStandup.tsx`**:

- Remove the three early-return blocks (off-day, physical, submitted)
- Compute `isStandupDay`, `todayMode`, and `submitted` as display flags
- Render the page in this order:
  - Title + contextual banner (info card for off-day/meeting/submitted)
  - Active commitments list with status change buttons (always)
  - "Add focus item" inline form -- title input + priority select + add button (always)
  - Standup form sections (mood, blockers, AI suggestions, submit) -- only when `isStandupDay && todayMode === "async" && !submitted`
  - Submitted summary section -- only when `submitted && !isEditing`, shown as a collapsible review card rather than the entire page

The "Add focus item" form inserts directly into the `commitments` table with `status: 'active'` and today's date, same as the existing standup flow but without requiring a full standup submission.

## Files

| File | Change |
|---|---|
| `src/pages/MyStandup.tsx` | Restructure rendering: remove early returns, add always-visible commitment management + add-item form, conditional standup form |

