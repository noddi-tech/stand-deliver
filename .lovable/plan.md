

# Analytics for StandFlow

## 1. Database Migration

Create `ai_weekly_digests` table with columns: id, team_id (FK teams), week_start date, week_end date, health_score int, completion_rate decimal, total_commitments int, total_completed int, total_carried int, total_blocked int, top_themes jsonb, ai_narrative text, ai_recommendations jsonb, work_distribution jsonb, created_at timestamptz, unique(team_id, week_start). RLS: team members can view; team leads can insert/update.

## 2. New Pages (3 files)

**Analytics (`/analytics`)** — 6 sections:
- Top metrics row: Health Score (SVG circular gauge), Completion Rate (% + Recharts sparkline), Active Blockers count, Carry-Over Rate %
- Work Distribution: Recharts `AreaChart` (stacked) — weekly Feature/Bug Fix/Tech Debt/Other
- Commitment Flow: horizontal funnel (custom bar chart) — Created → Done / Carried 1x / 2x / 3+ / Dropped
- Blocker Heatmap: CSS grid with category rows × week columns, background color intensity by count
- Participation: `BarChart` — response rate by day of week
- Trending Themes: ranked list of phrases extracted from standup text (tag-style badges)

All data fetched via React Query from `commitments`, `blockers`, `standup_responses`, `standup_sessions`, and `ai_weekly_digests`. Loading skeletons per section.

**My Analytics (`/my-analytics`)** — private, scoped to current user's `team_members.id`:
- Personal completion rate trend: `LineChart` over 30 days
- Carry-over patterns by work type: grouped bar chart
- Mood trend: `LineChart` mapping mood enum to numeric scale
- "Your Patterns" section: 2-3 insight cards computed client-side from the user's data

**Team Insights (`/team-insights`)** — team leads only (check `team_members.role = 'lead'`):
- Weekly digest from `ai_weekly_digests`: narrative, recommendations, work distribution summary
- Celebration callouts (e.g., "5 commitments completed this week — best in a month")
- Concern flags framed as questions ("Is the team overloaded? Carry-over rate increased 20%")
- Explicitly no individual rankings or comparative metrics
- Non-lead users see a "This page is for team leads" message

## 3. Shared Components

- `src/components/analytics/MetricCard.tsx` — reusable card with label, value, optional sparkline/gauge
- `src/components/analytics/HealthGauge.tsx` — SVG circular gauge (green/amber/red)
- `src/components/analytics/CommitmentFunnel.tsx` — horizontal funnel visualization
- `src/components/analytics/BlockerHeatmap.tsx` — grid heatmap component

## 4. Data Hooks

- `useAnalyticsMetrics(teamId)` — aggregates from commitments, blockers, sessions
- `useWeeklyDigests(teamId)` — fetches from ai_weekly_digests
- `useMyAnalytics(memberId)` — personal stats from commitments + responses
- All use React Query with appropriate cache/stale times

## 5. Routing

Add 3 new protected routes in `App.tsx`: `/analytics`, `/my-analytics`, `/team-insights`.

## 6. Design

- Dark-mode compatible Recharts colors using CSS variables (blue-500, emerald-500, amber-500, red-500, slate-400)
- Consistent card layout matching the existing design system
- Loading skeletons for every chart/section

