

# Make New Focus Items Optional During Standup

## Problem

Currently `MyStandup.tsx` enforces a minimum of 2 new focus items per standup submission. Team members on weeks where they're carrying existing commitments forward (no new work to add) are blocked from submitting unless they invent filler items — which defeats the purpose.

The "carry forward" mechanism already exists: any active/in-progress commitment that isn't marked done/dropped/blocked rolls into the new session via `carry_forward_commitments`. So a member who simply marks all previous items as still in-progress and submits with zero new focus items has fully accounted for their work.

## Changes

### 1. `src/pages/MyStandup.tsx` — Remove the 2-item minimum

**Line 474–478** (`requestCoachReview`): Remove the length check. If there are zero new commitments, skip the AI review entirely and go straight to submit (no point reviewing nothing). If there's 1+ new commitment, run the coach review as today.

```typescript
const requestCoachReview = async () => {
  // If user is only carrying forward (no new items), skip AI review and submit directly
  if (todayCommitments.length === 0) {
    handleSubmit();
    return;
  }
  // ... existing coach review logic unchanged
};
```

**Line 540–545** (`handleSubmit`): Remove the `< 2` guard entirely. Submission proceeds regardless of new-item count.

**Line 1203–1211** (Submit button): Update the label to be honest about what's happening when there are no new items:

```typescript
{coachLoading ? <Loader2 .../> : <Sparkles .../>}
{isEditing
  ? "Review & Update"
  : todayCommitments.length === 0
    ? "Submit Standup"
    : "Review & Submit"}
```

(When there are no new items, hide the Sparkles icon — replace with `<Check>` — since AI review is skipped.)

### 2. Add a small reassurance hint

Below the focus input area (around line 1145), when `showStandupForm && todayCommitments.length === 0 && allResolved`, show a muted line:

> "No new focus items? That's fine — your in-progress commitments will carry forward."

This makes it clear to the user that submitting empty is a valid path, not an oversight.

### 3. Files NOT changed

- The `!allResolved` guard on the submit button (line 1205) **stays** — users still need to address each previous commitment (mark done/dropped/blocked/in-progress) before submitting. That's the accountability check; it's separate from "add new work."
- No edge-function changes needed; backend never enforced this.
- `carry_forward_commitments` already handles the zero-new-items case correctly.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Remove `< 2` checks in `requestCoachReview` and `handleSubmit`; auto-skip AI review when zero new items; update submit button label; add reassurance hint |

