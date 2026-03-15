

# Revised Plan: Team Focus & AI Contribution Classification

Incorporating all six points of feedback. Here is the tightened plan.

## Summary of changes from original plan

| Feedback point | Resolution |
|---|---|
| 1. Fixed enum too rigid | Use freeform text `label` column instead of enum. AI distributes across active items + "unaligned" residual. |
| 2. No auditability | AI returns per-activity rationale. Stored alongside summary. Tooltips show reasoning. |
| 3. ai-team-summary too overloaded | New separate `ai-classify-contributions` edge function runs first, stores structured data. ai-team-summary references it. |
| 4. "team leads" not a concept | Already exists: `team_members.role` has `lead` value, `is_team_lead()` DB function exists. No changes needed. |
| 5. Dashboard widget premature | Only render FocusAlignment on Dashboard when >= 1 active focus item. Always show on Analytics. Show "Define focus areas" prompt otherwise. |
| 6. Graceful degradation | FocusAlignment handles missing `valueBreakdown` gracefully. Shows "Re-generate" action button. |

---

## A) Database: `team_focus` table (migration)

```sql
CREATE TABLE public.team_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  title text NOT NULL,
  label text NOT NULL,           -- freeform user-defined category label
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_focus ENABLE ROW LEVEL SECURITY;

-- RLS: members can view, leads can manage
CREATE POLICY "Team members can view focus" ON public.team_focus
  FOR SELECT TO authenticated USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team leads can insert focus" ON public.team_focus
  FOR INSERT TO authenticated WITH CHECK (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team leads can update focus" ON public.team_focus
  FOR UPDATE TO authenticated USING (is_team_lead(auth.uid(), team_id));
CREATE POLICY "Team leads can delete focus" ON public.team_focus
  FOR DELETE TO authenticated USING (is_team_lead(auth.uid(), team_id));
```

No enum. `label` is freeform text (e.g. "Platform scalability", "Q1 launch", "Tech debt").

## B) New edge function: `ai-classify-contributions`

Separate lightweight function that:
1. Fetches active `team_focus` items for the team
2. Fetches recent `external_activity` + `commitments` for the period
3. Sends to AI with tool-call schema requesting:
   - Per-member `valueBreakdown`: `{ [focusLabel]: percentage, unaligned: percentage }` (dynamic keys matching active focus titles)
   - Per-activity `classifications`: `[{ externalId, focusLabel | "unaligned", rationale: "one sentence" }]`
4. Returns structured data (caller can store or use inline)

This keeps `ai-team-summary` unchanged for now -- the Dashboard/Analytics pages call `ai-classify-contributions` separately via a new `useTeamFocus` hook.

**File**: `supabase/functions/ai-classify-contributions/index.ts`

## C) Settings UI: Focus tab

**New file**: `src/components/settings/FocusTab.tsx`
- Lists active focus items with their label badges
- Team leads see add/edit/archive controls
- Non-leads see read-only list
- Simple form: title, label (text input with suggestions from existing labels), optional description

**Edit**: `src/pages/Settings.tsx` -- add "Focus" tab

## D) New hook: `useTeamFocus`

**New file**: `src/hooks/useTeamFocus.ts`
- `useTeamFocusItems(teamId)` -- fetches active `team_focus` rows
- `useContributionClassification(teamId, period)` -- calls `ai-classify-contributions`, cached 30min like team summary

## E) FocusAlignment component

**New file**: `src/components/analytics/FocusAlignment.tsx`
- Horizontal stacked bar per member, segments colored per focus label + gray for "unaligned"
- Hover/tooltip on each segment shows the AI rationale for top activities in that category
- Handles `undefined` classification data gracefully: shows "Re-generate" button or "Define focus areas" prompt
- Legend auto-generated from active focus items

## F) Integration

**`src/pages/Analytics.tsx`**: Always show FocusAlignment card (with empty/prompt state if no focus items)

**`src/pages/Dashboard.tsx`**: Conditionally render FocusAlignment only when `teamFocusItems.length > 0`. Otherwise show a subtle card: "Define your team's focus areas to see alignment insights → Settings"

**`src/components/team/MemberBreakdown.tsx`**: Add small inline stacked bar per member card showing their value distribution (when data available)

## Files to create/edit

| File | Action |
|---|---|
| `supabase/migrations/*` | New migration for `team_focus` table |
| `supabase/functions/ai-classify-contributions/index.ts` | New edge function |
| `supabase/config.toml` | Add `[functions.ai-classify-contributions]` entry |
| `src/components/settings/FocusTab.tsx` | New component |
| `src/pages/Settings.tsx` | Add Focus tab |
| `src/hooks/useTeamFocus.ts` | New hook |
| `src/components/analytics/FocusAlignment.tsx` | New component |
| `src/pages/Analytics.tsx` | Integrate FocusAlignment |
| `src/pages/Dashboard.tsx` | Conditional FocusAlignment + prompt |
| `src/components/team/MemberBreakdown.tsx` | Inline value bars |

