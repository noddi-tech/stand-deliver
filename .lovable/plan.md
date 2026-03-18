

# Fix Focus Alignment: Show Focus Titles, Not Tags + Fix Rationales

## Problems

**1. Legend shows tags instead of focus item title**
The Focus Alignment chart displays "Platform, SaaS, API-integration" (the comma-separated tags) instead of "EON tyre integration" (the actual focus item title). This happens in two places:
- `useContributionClassification` builds `focusLabelMap` from `f.label` (tags) instead of `f.title`
- `FocusAlignment.tsx` builds its color map and legend from `focusItems[].label` instead of `focusItems[].title`

**2. Rationales are not member-specific**
The tooltip shows rationales filtered only by `focusLabel`, not by `memberId`. So hovering over Stian's bar shows rationales from anyone's work, making it seem generic/wrong.

**3. Members with no aligned work show large blue bars**
Tom Arne and Joachim likely have no EonTyre-related work but show colored segments because the `focusLabelMap` maps to the full comma-separated label string, and any classification with that `focus_item_id` gets grouped under it regardless of actual relevance.

## Changes

### 1. `src/hooks/useTeamFocus.ts` — `useContributionClassification`
Change `focusLabelMap` to map `focus_item_id → title` instead of `focus_item_id → label`:
```typescript
focusLabelMap.set(f.id, f.title);  // was: f.label
```

### 2. `src/components/analytics/FocusAlignment.tsx`
- Build `colorMap` from `focusItems[].title` instead of `focusItems[].label`
- Build legend from `focusItems[].title`
- Filter rationales by both `focusLabel` AND member ID:
```typescript
const rationales = classification.classifications
  .filter((c) => c.focusLabel === lbl && /* match member */)
  .slice(0, 3);
```

The `classifications` array doesn't currently carry `memberId`, so we need to either:
- Add `memberId` to `ActivityClassification` in the hook, or
- Cross-reference with `memberBreakdowns`

**Recommended**: Add `memberId` to the `ActivityClassification` interface and populate it in the query function, then filter rationales by `mb.memberId`.

### Files
- `src/hooks/useTeamFocus.ts` (2 changes: focusLabelMap key + add memberId to classifications)
- `src/components/analytics/FocusAlignment.tsx` (3 changes: colorMap, legend, rationale filter)

