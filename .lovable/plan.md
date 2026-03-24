

# Modal-Based AI Review Flow for Standup Submission

## Overview
Replace the inline coach card with a full modal dialog that opens when the user clicks "Review & Submit". The modal shows a progress animation during AI review, then displays the results with a clear "Submit Standup" button. This makes it impossible to miss that submission hasn't happened yet.

## UX Flow
```text
User clicks "Review & Submit"
        ↓
  ┌─────────────────────────────┐
  │  Modal opens                │
  │  ┌───────────────────────┐  │
  │  │ ✨ Reviewing with AI  │  │
  │  │ ████████░░░░  67%     │  │
  │  │ Analyzing focus items… │  │
  │  └───────────────────────┘  │
  └─────────────────────────────┘
        ↓  (AI returns)
  ┌─────────────────────────────┐
  │  AI Review Complete         │
  │                             │
  │  💡 Overall tip             │
  │                             │
  │  ┌─ Suggestion 1 ────────┐ │
  │  │ Apply / Dismiss        │ │
  │  └────────────────────────┘ │
  │  ┌─ Suggestion 2 ────────┐ │
  │  │ Looks good ✓           │ │
  │  └────────────────────────┘ │
  │                             │
  │  [Apply All]  [Submit ████] │
  └─────────────────────────────┘
```

## Changes

### 1. `src/pages/MyStandup.tsx`
- Rename button from "Submit Standup" to **"Review & Submit"**
- On click, open a `Dialog` modal and trigger `requestCoachReview` inside it
- Add state: `reviewModalOpen` (boolean)
- Remove inline `showCoach` rendering of `StandupCoachCard`
- Modal has two phases:
  - **Loading phase**: Sparkles icon, animated progress bar (fake progress 0→90% over ~3s), "Reviewing your focus items with AI..." text
  - **Results phase**: Render `StandupCoachCard` content inside modal with prominent "Submit Standup" button
- On submit, close modal and run `handleSubmit()`
- On coach failure (AI unavailable), modal shows fallback message with direct "Submit without review" button

### 2. `src/components/ai/StandupCoachCard.tsx`
- No structural changes needed — it already renders suggestions, apply/dismiss, and submit buttons
- It will now be rendered inside the modal instead of inline

### 3. Button label in non-coach state
- Change `"Submit Standup"` → `"Review & Submit"`
- Loading state: `"Opening review..."` (brief, before modal appears)

## Files to change

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Add review modal with loading animation + coach results, rename button |

