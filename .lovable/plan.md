

# Hierarchical Focus Areas: Groups and Sub-tasks

## Problem
Currently all focus items are flat. "EonTyre integration" and "Onboard Trønderdekk" would be siblings, but in reality onboarding Trønderdekk **depends on** the EonTyre integration. There's no way to express that relationship, which means the AI classifier can't understand that work on EonTyre ultimately serves the Trønderdekk onboarding goal.

## Design

Add an optional `parent_id` column to `team_focus`. A focus item with children becomes a **Focus Group**. Children are **Focus Tasks**. The hierarchy is one level deep (no grandchildren).

```text
┌─────────────────────────────────────────────┐
│ 🎯 Onboard Trønderdekk        [Group]      │
│    Creating a two-way API integration...    │
│                                             │
│   ├─ EonTyre integration       [Task]       │
│   ├─ Set up Dintero accounts   [Task]       │
│   └─ Configure Navio tenant    [Task]       │
└─────────────────────────────────────────────┘
```

### Classification benefit
When the AI sees a focus group with children, the prompt includes the hierarchy. Work on a child task counts as **indirect** alignment with the parent group, and **direct** alignment with the child. This solves the Dintero problem: "Set up Dintero" is direct to the Dintero onboarding task, but only indirect to EonTyre (or none, if it's unrelated to the API).

## Changes

### 1. Migration: add `parent_id` to `team_focus`
```sql
ALTER TABLE public.team_focus
  ADD COLUMN parent_id uuid REFERENCES public.team_focus(id) ON DELETE SET NULL;

CREATE INDEX idx_team_focus_parent ON public.team_focus(parent_id);
```

### 2. Update hooks (`src/hooks/useTeamFocus.ts`)
- `TeamFocusItem` interface: add `parent_id: string | null`
- `useAddFocusItem`: accept optional `parent_id`
- No changes to queries — they already `SELECT *`

### 3. Update FocusTab UI (`src/components/settings/FocusTab.tsx`)
- Render items grouped: parent items shown as collapsible cards, children indented beneath
- "Add Focus Area" form gets an optional "Parent" dropdown (populated with existing top-level items)
- Top-level items without children look exactly as they do today
- When a top-level item has children, show them nested with a subtle indent and connector line

### 4. Update AI classifier prompt (`supabase/functions/ai-classify-contributions/index.ts`)
- When building `focusContext`, render parent-child relationships:
  ```
  - [uuid] "Onboard Trønderdekk" (GROUP)
    Objective: Onboard Trønderdekk as Navio customer
    Children:
      - [uuid] "EonTyre integration" — Two-way API integration
      - [uuid] "Set up Dintero" — Payment provider setup
    → Work on a child = "direct" to child, "indirect" to parent
  ```
- This gives the AI structural context to correctly distinguish EonTyre API work from general Trønderdekk onboarding tasks

### 5. Update FocusAlignment chart (`src/components/analytics/FocusAlignment.tsx`)
- Group-level items aggregate their children's alignment percentages
- Tooltip shows breakdown by child task within a group

## Files to change

| File | Change |
|------|--------|
| `supabase/migrations/` | Add `parent_id` column |
| `src/hooks/useTeamFocus.ts` | Add `parent_id` to interface and mutations |
| `src/components/settings/FocusTab.tsx` | Grouped rendering, parent selector in form |
| `supabase/functions/ai-classify-contributions/index.ts` | Hierarchical focus context in prompt |
| `src/components/analytics/FocusAlignment.tsx` | Aggregate child alignment under parent |
| `src/integrations/supabase/types.ts` | Add `parent_id` to type |

