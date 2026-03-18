

# Add Badge Chips to Dashboard Recent Activity

## Problem
The Dashboard's "Recent Activity" section renders activity items without the work-type badge chip (Feature, Bug Fix, Refactor, etc.), even though `useRecentActivity` already fetches `badgeKey` for each item. The Activity page shows these badges because it renders `ActivityBadgeChip` — the Dashboard simply never includes it.

## Fix

**`src/pages/Dashboard.tsx`** — Add `ActivityBadgeChip` next to the title in each activity row.

In the activity card rendering (around line 370), after the title `<p>` tag, add:

```tsx
{a.badgeKey && <ActivityBadgeChip badgeKey={a.badgeKey} />}
```

This requires importing `ActivityBadgeChip` at the top of the file (it's already used in `Activity.tsx`).

Single-file, ~3 lines changed.

