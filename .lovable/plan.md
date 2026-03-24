

# Fix: Team Feed Shows Live Commitment Statuses

## Problem
Team Feed reads statuses from the `yesterday_text` field in `standup_responses`, which is a static snapshot written at submit time. When a user updates commitment statuses after submitting (e.g., marking items done later), the Team Feed never reflects those changes because it only parses the frozen text.

Additionally, if items were marked done during the standup flow, the snapshot may not have captured the correct status due to timing.

## Solution
Make Team Feed pull live commitment statuses from the `commitments` table instead of parsing `yesterday_text` for status arrows.

## Changes

### 1. `src/pages/TeamFeed.tsx`

**Add a new query** to fetch commitments for the displayed sessions:
- Query `commitments` table where `origin_session_id` or `current_session_id` matches the session IDs we already have
- This gives us live `status` values per commitment

**Update rendering logic:**
- For each response's `yesterday_text`, still parse the text for item titles (strip `→ status` suffix)
- But look up the **live** status from the `commitments` query instead of the text suffix
- Match by title + member_id
- Fall back to the text-parsed status if no commitment match is found (backward compat for old data)

### 2. Query structure

```text
commitments table query:
  SELECT id, title, status, member_id, origin_session_id, current_session_id
  WHERE current_session_id IN (sessionIds)
     OR origin_session_id IN (sessionIds)
```

Then build a lookup map: `Map<member_id + title, status>` for O(1) access during render.

### 3. Realtime (optional but recommended)
The existing `useRealtimeInvalidation` pattern already invalidates on `commitments` changes. Add the new query key to the invalidation list so Team Feed updates live when someone marks an item done.

## Files to change

| File | Change |
|------|--------|
| `src/pages/TeamFeed.tsx` | Add commitments query, use live status in render, keep text fallback |

One file, no schema changes. The `yesterday_text` field continues to be written as-is for backward compatibility.

