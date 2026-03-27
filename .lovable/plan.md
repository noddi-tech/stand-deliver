

# Enrich Retrospective Narrative + Wire V2 Creation Context

## Overview

Two problems: (1) the retrospective LLM prompt only receives aggregate counts, producing a useless one-liner fallback narrative, and (2) the Create v2 dialog is a blank form with no predecessor context. This plan fixes both.

---

## 1. Enrich `ai-focus-retrospective` with real content

**File: `supabase/functions/ai-focus-retrospective/index.ts`**

After the existing Phase 1 aggregation (line ~136), add three additional queries:

- **Top 20 activity titles**: Query `external_activity` for IDs in `extActivityIds`, selecting `title, source, activity_type, external_url`. Order by `occurred_at desc`, limit 20.
- **Commitment text**: Query `commitments` for IDs in `commitmentIds`, selecting `title, status, carry_count, resolution_note, blocked_reason`. (The join path is already established -- `commitmentIds` comes from `impact_classifications` where `source_type = 'commitment'`.)
- **Blocker descriptions**: Query `blockers` for `commitment_id` in `commitmentIds`, selecting `description, category, is_resolved, days_open`.

Update the LLM prompt (lines 195-222) to include these actual titles/descriptions alongside the aggregate metrics. The prompt should reference specific PR names, commitment titles, and blocker descriptions so the AI can write a meaningful narrative.

Update the fallback narrative (line 277) to include top 3 activity titles and source breakdown instead of just counts.

## 2. Add `Regenerate` button on completed items

**File: `src/components/settings/FocusTab.tsx`** (CompletedFocusItemRow, ~line 282)

Next to "View Retrospective", add a "Regenerate" button (visible to leads) that calls `ai-focus-retrospective` with `{ focus_item_id, team_id, create_row: false }` (it will find and overwrite the existing row). Show a spinner while pending.

## 3. Add `useDeferredItems` + `usePredecessorContext` hooks

**File: `src/hooks/useFocusRecall.ts`**

- `useDeferredItems(focusItemId, teamId)`: Query `impact_classifications` where `focus_item_id = focusItemId` and `source_type = 'commitment'` to get commitment IDs, then query `commitments` for those IDs where `status` in `('carried', 'active', 'blocked')`. Return `{ id, title, status, carry_count }[]`.
- `usePredecessorContext(predecessorId, teamId)`: Combines `useFocusRetrospective(predecessorId)` + `useDeferredItems(predecessorId, teamId)`.

## 4. Wire V2 dialog with predecessor context

**File: `src/components/settings/FocusTab.tsx`** (V2 Dialog, lines 1002-1036)

When `v2PredecessorId` is set:
- Call `usePredecessorContext(v2PredecessorId, teamId)` at the component level
- Show a collapsible "v1 Summary" section above the form fields: completion rate, activity count, blocker count, and `executive_summary` text from the retrospective narrative
- Show "Deferred Items" as clickable chips -- clicking appends the commitment title to `v2Description`

## 5. Trigger gap analysis post-creation

**File: `src/components/settings/FocusTab.tsx`** (handleCreateV2, ~line 571)

After `createV2Mutation.mutateAsync` succeeds:
- Fire-and-forget call to `ai-focus-gap-analysis` with `{ v1_focus_id: v2PredecessorId, v2_focus_id: newFocusId, team_id: teamId }`
- Toast: "Gap analysis generating..."
- The `createV2Mutation` needs to return the new focus ID (already does via `.select().single()` in the hook)

## 6. Show gap analysis inline on active focus areas

**File: `src/components/settings/FocusTab.tsx`** (FocusItemRow or active items section)

For active items with `predecessor_id`:
- Query `focus_gap_analyses` where `v2_focus_id = item.id` using `useFocusGapAnalysis`
- If exists, render a collapsible teaser below the row: "AI has X suggestions for this iteration"
- Expanding shows `FocusGapAnalysisCard` inline

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/ai-focus-retrospective/index.ts` | Add activity/commitment/blocker content queries; enrich LLM prompt; improve fallback |
| `src/hooks/useFocusRecall.ts` | Add `useDeferredItems`, `usePredecessorContext` hooks |
| `src/components/settings/FocusTab.tsx` | V2 dialog context, post-creation gap analysis, regenerate button, inline gap analysis on active items |

## Implementation Order

1. Edge function prompt enrichment (highest impact)
2. `useDeferredItems` + `usePredecessorContext` hooks
3. Regenerate button on completed items
4. V2 dialog with predecessor context
5. Post-creation gap analysis trigger
6. Inline gap analysis on active items

