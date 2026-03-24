

# Fix: Show Completed Items on Today's Standup in Team Feed

## Root Cause

Items marked `done` during standup submission are correctly stored in the `commitments` table with `current_session_id` pointing to today's session. The Team Feed already queries these commitments. However, the **rendering logic** only shows items parsed from `yesterday_text` — it never adds completed commitments that exist in the DB but are missing from the text snapshot.

The `yesterday_text` field only contains items that were still `active`/`in_progress` when the standup form loaded (`previousCommitments` query filters out `done` items). Items checked done during the form ARE in `statusOverrides`, and their text appears with `→ done`, but items that were already resolved before the form loaded are excluded entirely.

Additionally, `todayItems` (focus items) show live statuses from the commitments table, but there's no dedicated "Recently Completed" section showing items resolved since submission.

## Solution

For each response card in Team Feed, merge two sources of completed items:

1. **From `yesterday_text`** — items with `→ done` or `→ dropped` status (already working)
2. **From `commitments` table** — any commitment for this member with `status = 'done'` or `'dropped'` AND `current_session_id` matching this session, that is NOT already in the `yesterday_text` list

This ensures items resolved before the form loaded (and thus excluded from `yesterday_text`) still appear under "Completed" on the correct day.

## Changes

### `src/pages/TeamFeed.tsx`

1. After computing `completedItems` from `yesterday_text`, find additional done/dropped commitments from the `commitments` array where:
   - `member_id` matches `r.member_id`
   - `current_session_id` matches `session.id`  
   - `status` is `done` or `dropped`
   - Title is NOT already in the `completedItems` list (dedup)

2. Merge these extra items into the "Completed" section rendering

3. Each extra commitment renders as `• {title}` with the appropriate status badge, same as existing items

## Technical detail

```tsx
// After computing completedItems from yesterday_text:
const extraCompleted = commitments.filter(c =>
  c.member_id === r.member_id &&
  c.current_session_id === session.id &&
  (c.status === "done" || c.status === "dropped") &&
  !completedItems.some(item => {
    const { text } = parseItemStatus(item);
    return text.trim().toLowerCase() === c.title.trim().toLowerCase();
  })
);
// Render both completedItems (from text) and extraCompleted (from DB)
```

One file changed, rendering logic only. No schema or query changes needed — the data is already fetched.

