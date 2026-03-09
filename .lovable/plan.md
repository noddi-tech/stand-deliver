

## ClickUp Status Sync

### Problem
When a user marks a commitment as "done" or changes its status in the standup, there's no sync back to ClickUp. Users have to update status in both places.

### Solution
Two-way-ish sync: when a commitment status changes in StandFlow, push the corresponding status update to ClickUp via a new edge function.

### Changes

**1. Database: Add `clickup_task_id` column to `commitments` table**

```sql
ALTER TABLE public.commitments ADD COLUMN clickup_task_id text;
```

This links a commitment to its ClickUp task. Populated when importing tasks from ClickUp.

**2. New edge function: `clickup-update-task`**

Accepts `{ org_id, clickup_task_id, new_status }` where `new_status` maps from StandFlow statuses to ClickUp statuses:
- `done` → "complete" (or "closed")
- `in_progress` → "in progress"
- `blocked` → "in progress" (with a comment noting the blocker)
- `active` → "open" / "to do"

The function looks up the org's API token from `clickup_installations`, then calls `PUT https://api.clickup.com/api/v2/task/{task_id}` with `{ status: "..." }`.

ClickUp statuses vary per space/list, so the function will first fetch valid statuses for the task and pick the closest match.

**3. MyStandup.tsx: Sync on status change**

When `updateCommitmentMutation` fires for a commitment that has a `clickup_task_id`, fire-and-forget call to `clickup-update-task` to push the status.

When importing ClickUp tasks, store `clickup_task_id` on the commitment row.

**4. MyStandup.tsx: Store `clickup_task_id` on import**

Update the ClickUp import flow so when tasks are added as commitments, the ClickUp task ID is saved in `NewCommitment` and persisted to the `commitments` table on submit.

### Files changed

| File | Change |
|------|--------|
| New migration | Add `clickup_task_id` column to `commitments` |
| New `supabase/functions/clickup-update-task/index.ts` | Push status changes to ClickUp API |
| `src/pages/MyStandup.tsx` | Store `clickup_task_id` on import, sync status on change |
| `supabase/config.toml` | Register `clickup-update-task` function |

### ClickUp API detail

**Update task status**: `PUT /api/v2/task/{task_id}` with body `{ "status": "complete" }`

The main challenge is that ClickUp statuses are custom per list. The edge function will:
1. Fetch the task first (`GET /task/{id}`) to get its `list.id`
2. Fetch list statuses (`GET /list/{id}`) to find valid status names
3. Map StandFlow status to the closest ClickUp status by fuzzy matching ("complete", "closed", "done" for done; "in progress" for in_progress; "to do", "open" for active)

