

## Add Time Range to Focus Items

Add optional `starts_at` and `ends_at` timestamp columns to `team_focus`. Both are nullable — a focus item can have neither (ongoing), just an end date (deadline), or both (bounded period). The AI classification prompt can then reference whether items are current, upcoming, or expired.

### Database
- Migration: add `starts_at timestamptz` and `ends_at timestamptz` (both nullable) to `team_focus`

### Hook (`src/hooks/useTeamFocus.ts`)
- Add `starts_at` and `ends_at` to `TeamFocusItem` interface
- Pass through in add/update mutations

### Settings UI (`src/components/settings/FocusTab.tsx`)
- Add two optional date inputs to the form: "Starts" and "Ends" (using native `<Input type="date">`)
- Display dates inline on each focus item card: show as "Until Mar 30" (deadline-only), "Mar 1 – Mar 30" (range), or nothing (ongoing)
- Visually dim items past their `ends_at` date (similar to archived but still active)

### AI Classification (`supabase/functions/ai-classify-contributions/index.ts`)
- Include date context in the focus descriptions sent to the AI prompt so it can weigh current vs expiring focus areas

### FocusAlignment (`src/components/analytics/FocusAlignment.tsx`)
- No changes needed — it already reads labels dynamically from focus items

### Files to change
| File | Change |
|---|---|
| `supabase/migrations/*` | Add `starts_at`, `ends_at` columns |
| `src/hooks/useTeamFocus.ts` | Extend interface + mutations |
| `src/components/settings/FocusTab.tsx` | Date inputs in form, date display on cards |
| `supabase/functions/ai-classify-contributions/index.ts` | Include dates in prompt context |

