

# Multi-Tag Support for Focus Area Labels

## Problem
The label field stores whatever text is typed as a single string. Typing "Platform, SaaS" creates one tag called "Platform, SaaS" instead of two separate tags.

## Approach
Keep the DB `label` column as a comma-separated string (no schema change needed). Update the UI to treat commas as tag separators and render/manage them as individual chips.

### Changes

**`src/components/settings/FocusTab.tsx`**
1. **Tag input UX**: Replace the single label `<Input>` with a tag-chip input:
   - Show selected labels as removable chips above/inside the input
   - Typing a comma or pressing Enter commits the current text as a new tag
   - Clicking an existing tag chip toggles it on/off (add/remove from selection)
   - Store internally as `string[]`, join with `", "` before saving to DB
2. **Display**: Where labels are shown on active/archived items, split `item.label` by `", "` and render each as a separate `<Badge>`.
3. **Existing tag suggestions**: Derive unique tags by splitting all existing labels, so "Platform, SaaS" contributes both "Platform" and "SaaS" to the suggestion list.

**`src/hooks/useTeamFocus.ts`** — In `useContributionClassification`, when building `focusLabelMap`, no change needed since labels are matched by `focus_item_id`, not parsed.

No database or edge function changes required.

