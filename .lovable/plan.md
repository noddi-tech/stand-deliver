

# AI-Powered Recall: Focus Area Versioning with Institutional Memory (Final)

## Pre-requisite: Anthropic API Key

We need a `ANTHROPIC_API_KEY` secret for generating embeddings via Claude. The Lovable AI gateway will still be used for narrative generation (retrospectives, gap analysis), but embeddings require a direct Claude API call. I'll prompt you to add this secret before the embedding function is built.

**Note:** For the LLM narrative calls (retrospectives, gap analysis), we'll use the existing Lovable AI gateway with `google/gemini-3-flash-preview` since it's already configured. Only the embedding function needs the Anthropic key — however, Anthropic doesn't offer a dedicated embeddings endpoint like OpenAI does. 

**Revised embedding approach:** We'll use OpenAI's `text-embedding-3-small` for embeddings (requires `OPENAI_API_KEY`) since neither Claude nor the Lovable AI gateway provides an embeddings endpoint. Alternatively, we can use the Lovable AI gateway to generate a short semantic summary of each focus area and use `pg_trgm` on those summaries for similarity matching — avoiding the need for any additional API key. Let me know which you prefer, or I'll proceed with the hybrid approach: pg_trgm for title/description matching + Lovable AI gateway for generating enriched summaries that improve match quality.

---

## Database Changes

### Migration 1: Core tables + extensions

- Enable `pg_trgm` extension
- Create `focus_retrospectives` table with `status` field (pending | generating | complete | failed)
  - RLS: SELECT for team members only. No INSERT/UPDATE/DELETE policies — writes happen via service_role from edge functions. Comment in migration noting this explicitly.
- Create `focus_gap_analyses` table with suggestions JSONB (each suggestion has a stable `suggestion_id` UUID)
  - RLS: SELECT for team members, UPDATE for team members (to set accept/reject)
- Create `focus_insights` table (insight_type, title, description, confidence, is_dismissed)
  - RLS: SELECT + UPDATE (dismiss) for team members
- Alter `team_focus`: add `predecessor_id` and `completed_at` columns only (no `completion_summary_id` — retrospective is looked up via `focus_retrospectives.focus_item_id`)

### Migration 2: Similarity search function

- `find_similar_focus_areas` RPC using pg_trgm similarity on title + description + label
- Filters to completed focus areas only, returns similarity score

---

## Edge Functions

### 1. `ai-focus-retrospective`
Two-phase async pipeline using Lovable AI gateway (`google/gemini-3-flash-preview`):
- **Phase 1 — SQL aggregation** using `focus_item_id` joins (not date ranges): commitments by status, carry-forward rate, blocker categories, external activity counts, effort distribution by impact_tier
- **Phase 2 — LLM narrative** via tool calling for structured output: Executive Summary, What Shipped, What Blocked, Recurring Patterns, Where We Got Lucky, Recommendations
- Updates `focus_retrospectives` row status from `generating` to `complete` (or `failed`)

### 2. `ai-focus-gap-analysis`
- Fetches v1 retrospective + v2 description
- LLM generates gap analysis with structured suggestions (each has `suggestion_id`)
- **Persists** to `focus_gap_analyses` table
- Returns stored analysis

### 3. `focus-insight-cron` (bonus)
- Weekly pg_cron job checking carry-forward rates, recurring blockers, capacity signals
- Writes to `focus_insights` with confidence scores (threshold 0.7)

---

## Frontend Changes

### `src/hooks/useTeamFocus.ts` — new hooks
- `useCompleteFocusArea`: sets `completed_at` + `is_active = false` instantly, creates `focus_retrospectives` row with status `pending`, invokes `ai-focus-retrospective` fire-and-forget
- `useFocusRetrospective(focusItemId)`: queries `focus_retrospectives` with Supabase Realtime subscription for status changes
- `useSimilarFocusAreas(teamId, searchText)`: calls `find_similar_focus_areas` RPC
- `useCreateFocusV2(teamId)`: creates focus area with `predecessor_id`
- `useFocusGapAnalysis(v1Id, v2Id)`: fetches/creates from `focus_gap_analyses`
- `useUpdateGapSuggestion`: updates accept/reject by `suggestion_id` in JSONB
- `useFocusInsights(teamId)`: queries `focus_insights` where `is_dismissed = false`
- `useDismissInsight`: sets `is_dismissed = true` on a specific insight

### `src/components/settings/FocusTab.tsx` — modifications
- Add "Complete" button (CheckCircle icon) alongside Archive for leads
- Completion = instant (set completed_at, move to Completed section) + async retrospective
- New "Completed" section between Active and Archived
  - Shows status: skeleton/spinner for pending/generating, "View Retrospective" + "Create v2" for complete, "Retry" for failed
- Predecessor chain badge: "v2 of {title}" on items with predecessor_id

### `src/components/focus/FocusRetrospectivePanel.tsx` (new)
- Sheet component with accordion sections: Executive Summary, Metrics, What Shipped, What Blocked, Recommendations
- Reused in both Completed section and v2 creation flow

### `src/components/focus/FocusPredecessorPicker.tsx` (new)
- Search input querying `find_similar_focus_areas` for completed focus areas
- Shows results with similarity score + completion date

### `src/components/focus/FocusGapAnalysisCard.tsx` (new)
- Displays AI suggestions with per-item accept/reject (tracked by `suggestion_id`)
- Accepted items pre-populate as sub-tasks in new focus area

---

## Implementation Order

1. DB migrations (tables, pg_trgm, functions, RLS with explicit service_role comments)
2. `ai-focus-retrospective` edge function
3. Hooks: `useCompleteFocusArea`, `useFocusRetrospective` with Realtime
4. FocusTab: "Complete" action + Completed section with status states
5. `FocusRetrospectivePanel` component
6. `ai-focus-gap-analysis` edge function with persistence + stable suggestion IDs
7. Hooks: `useSimilarFocusAreas`, `useFocusGapAnalysis`, `useUpdateGapSuggestion`
8. `FocusPredecessorPicker` + `FocusGapAnalysisCard` components
9. V2 creation flow wired end-to-end
10. Hooks: `useFocusInsights`, `useDismissInsight`
11. `focus-insight-cron` proactive detection (bonus)

---

## Files Summary

| File | Action |
|------|--------|
| Migration 1: tables + extensions | Create |
| Migration 2: similarity function | Create |
| `supabase/functions/ai-focus-retrospective/index.ts` | Create |
| `supabase/functions/ai-focus-gap-analysis/index.ts` | Create |
| `supabase/functions/focus-insight-cron/index.ts` | Create |
| `supabase/config.toml` | Edit (3 new functions) |
| `src/hooks/useTeamFocus.ts` | Edit (8 new hooks) |
| `src/components/settings/FocusTab.tsx` | Edit (Complete action, Completed section, Create v2) |
| `src/components/focus/FocusRetrospectivePanel.tsx` | Create |
| `src/components/focus/FocusPredecessorPicker.tsx` | Create |
| `src/components/focus/FocusGapAnalysisCard.tsx` | Create |

