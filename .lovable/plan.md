

## Root Cause Analysis

### Issue 1: "Not able to resolve standup items"

The `allResolved` gate on line 333 only counts `done` or `dropped` as "resolved." If a user marks items as `in_progress` or `blocked`, those do NOT count — meaning the submit button stays disabled forever unless EVERY item is marked done or dropped. Users who want to keep working on something today cannot proceed.

```text
User clicks "In Progress" on item → item looks selected
But allResolved = false → submit button stays disabled
User is stuck — can't submit standup
```

### Issue 2: `carry_forward_commitments` is team-wide

The RPC runs `WHERE team_id = p_team_id AND status IN ('active', 'in_progress')` — affecting ALL team members' commitments, not just the submitter's. When user A submits their standup, every teammate's active/in_progress commitments get flipped to "carried." Also, items the user explicitly marked as "in_progress" get immediately overwritten to "carried" by this same call.

### Issue 3: 500 error on standup submission

The `ai-coach-standup` function (which runs before submit) can throw a 500 if the AI gateway is unavailable. The catch handler calls `handleSubmit()` as a fallback, but if that also encounters an error (e.g., from the `carry_forward_commitments` RPC or a DB issue), the user sees a 500 with no helpful message.

## Plan

### 1. Fix the `allResolved` gate
Change the resolution check to count `in_progress` and `blocked` as "addressed" (the user has acknowledged them). Only `active` and `carried` items remain unresolved. This lets users submit while keeping items in progress.

**File: `src/pages/MyStandup.tsx`** (lines 329-334)
- Change `resolvedCount` to count items where status is NOT `active` or `carried` (i.e., any explicit user action counts)
- Rename to `addressedCount` for clarity

### 2. Scope `carry_forward_commitments` to the current member
Update the RPC to accept a `p_member_id` parameter and add `AND member_id = p_member_id` to the WHERE clause. This prevents one user's submission from affecting teammates' commitments.

**Database migration**: Alter the `carry_forward_commitments` function signature.

**File: `src/pages/MyStandup.tsx`**: Pass `memberId` when calling the RPC.

### 3. Exclude items the user explicitly set to `in_progress`
In the submit flow, items with `statusOverrides` set to `in_progress` should NOT be carried. Add `AND status != 'in_progress'` or (better) run carry_forward BEFORE persisting status overrides, then persist overrides after.

Actually, the simplest fix: reorder the submit flow so `carry_forward` runs first, then status overrides are applied. This way:
1. carry_forward sets stale items to "carried" 
2. User's explicit status choices override that

### 4. Improve error handling for the 500
In `requestCoachReview`, when the coach fails and we fallback to `handleSubmit()`, wrap that fallback in its own try/catch so errors propagate cleanly instead of being swallowed or double-thrown.

### Summary of changes
- **Migration**: Update `carry_forward_commitments` RPC to accept and filter by `p_member_id`
- **`src/pages/MyStandup.tsx`**: 
  - Fix `allResolved` to treat `in_progress`/`blocked` as addressed
  - Reorder submit: carry_forward first, then status overrides
  - Pass `memberId` to the RPC
  - Better error handling in the coach fallback path

