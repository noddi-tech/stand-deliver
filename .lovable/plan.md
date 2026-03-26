
# AI-Powered Recall: Focus Area Versioning with Institutional Memory

## Status: Implemented

## What was built

### Database
- `focus_retrospectives` table (with status field: pending/generating/complete/failed)
- `focus_gap_analyses` table (with stable suggestion_id UUIDs in JSONB)
- `focus_insights` table (for proactive pattern detection)
- `team_focus` extended with `predecessor_id` and `completed_at`
- `pg_trgm` extension + `find_similar_focus_areas` RPC for similarity search
- All tables have proper RLS (SELECT for team members; writes via service_role)

### Edge Functions
- `ai-focus-retrospective`: Two-phase async pipeline (SQL aggregation via focus_item_id joins + LLM narrative via Lovable AI gateway)
- `ai-focus-gap-analysis`: Persisted gap analysis with accept/reject per suggestion
- `focus-insight-cron`: Weekly pattern detection (carry-forward rates, recurring blockers)

### Frontend Hooks (`src/hooks/useFocusRecall.ts`)
- `useCompleteFocusArea` — instant completion + async retrospective
- `useFocusRetrospective` — with Supabase Realtime subscription
- `useSimilarFocusAreas` — pg_trgm similarity search
- `useCreateFocusV2` — create with predecessor_id
- `useFocusGapAnalysis` — fetch/create gap analysis
- `useUpdateGapSuggestion` — accept/reject by suggestion_id
- `useFocusInsights` — active insights
- `useDismissInsight` — dismiss insights

### UI Components
- `FocusRetrospectivePanel` — Sheet with accordion sections (narrative, metrics, recommendations)
- `FocusPredecessorPicker` — Search completed focus areas by similarity
- `FocusGapAnalysisCard` — Accept/reject AI suggestions
- `FocusTab` updated with: Complete action, Completed section, v2 creation dialog, predecessor badges, insights banner
