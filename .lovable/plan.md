

# Fix Two Focus Area Issues

## Issue 1: Uncommitted tag text lost on save
When the user types "API-integration" in the tag input and clicks "Update" without pressing Enter/comma first, the text remains in the raw input and is never committed to the `tags` array. So `tags.join(", ")` saves without it.

**Fix in `src/components/settings/FocusTab.tsx`**: In `handleSubmit`, before building the payload, auto-commit any remaining text in the TagInput. The cleanest approach is to expose a ref or callback from TagInput, but simpler: lift the `input` state up so `handleSubmit` can flush it. However, to keep TagInput self-contained, add an `onFlush` callback prop that TagInput calls via `useImperativeHandle`, or more simply:

- Add an `onSubmit` or `commitPending` pattern: give `TagInput` a ref with a `flush()` method that commits any pending input text and returns the final tags array.
- In `handleSubmit`, call `tagInputRef.current?.flush()` before reading `tags`.

Alternatively (simpler): lift the `input` state into the parent alongside `tags`. Then in `handleSubmit`, if `input.trim()` is non-empty, add it to tags before saving.

**Recommended approach**: Make `TagInput` accept an imperative ref with a `flush` method. In `handleSubmit`, call flush before proceeding. This keeps the component clean.

## Issue 2: Focus Alignment loading takes too long
The reclassify mutation fires on every focus item save, sending all activities from the last 14 days through the AI in batches of 20. While this runs (could be 30+ seconds), the Dashboard's FocusAlignment shows skeleton loaders because `classificationLoading` stays true during the query refetch triggered by cache invalidation.

The real problem: the `useContributionClassification` query reads from the DB (fast), but gets invalidated by the mutation, causing a refetch while the mutation is still running. The skeleton shows because `isLoading` is true during initial fetch or refetch.

**Fix**: 
- Use `isFetching` vs `isLoading` distinction — show existing data with a subtle refresh indicator instead of replacing content with skeletons. In `FocusAlignment.tsx`, only show skeletons on initial load (`isLoading && !data`), not on background refetches.
- In Dashboard/Analytics, pass `isFetching` separately so the refresh button can spin without hiding existing data.

### Files to change

1. **`src/components/settings/FocusTab.tsx`** — Auto-commit pending input text in `handleSubmit` before saving. Add `useImperativeHandle` to `TagInput` with a `flush()` method, or simply lift `input` state.

2. **`src/pages/Dashboard.tsx`** and **`src/pages/Analytics.tsx`** — Pass `isFetching` instead of `isLoading` to `FocusAlignment` so it doesn't show skeletons during background refetches.

3. **`src/components/analytics/FocusAlignment.tsx`** — Only show skeleton state when there's no existing data (initial load). When data exists and a refetch is happening, keep showing the data with a spinner on the refresh button.

