

# AI-Powered Focus Area Recommendations

## Concept
Add a "Suggest Focus Areas" button to the FocusTab that analyzes recent GitHub activity, ClickUp tasks, and standup data to recommend what the team should focus on. Uses the existing `ai-suggest-focus` edge function pattern but repurposed for team-level focus area generation.

## How It Works
1. New edge function `ai-recommend-focus` gathers the last 14 days of `external_activity` (GitHub PRs, ClickUp tasks), `commitments`, and `blockers` across ALL team members
2. AI analyzes patterns: what themes recur, what's blocking progress, what's getting the most activity
3. Returns 3-5 suggested focus area titles with tags and rationale
4. UI shows suggestions as dismissible cards with a one-click "Add as Focus Area" action

## Changes

### 1. New Edge Function: `supabase/functions/ai-recommend-focus/index.ts`
- Accepts `team_id`
- Queries `external_activity` (grouped by title patterns, activity_type, source), `commitments` (active/carried/blocked), and `blockers` (open, by category) for the whole team over 14 days
- Sends context to Lovable AI Gateway with structured tool calling to return `{ suggestions: [{ title, tags, reason, priority }] }`
- Deduplicates against existing `team_focus` items so it doesn't suggest what's already defined

### 2. Update `supabase/config.toml`
- Add `[functions.ai-recommend-focus]` with `verify_jwt = false`

### 3. Update `src/components/settings/FocusTab.tsx`
- Add a "Suggest with AI" button (with Sparkles icon) next to "Add Focus Area"
- On click, calls `ai-recommend-focus` via `supabase.functions.invoke`
- Shows loading state while processing
- Renders suggestions as cards with: title, suggested tags, AI rationale
- Each card has "Add" button that pre-fills the focus area form with the suggestion
- "Dismiss" button to remove a suggestion
- Handles 402/429 errors with descriptive toasts

### 4. No DB migration needed
- Uses existing tables (`external_activity`, `commitments`, `blockers`, `team_focus`)

## Files
| File | Change |
|------|--------|
| `supabase/functions/ai-recommend-focus/index.ts` | New edge function |
| `supabase/config.toml` | Add function entry |
| `src/components/settings/FocusTab.tsx` | Add AI suggest button + suggestion cards UI |

