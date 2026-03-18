

# Make Focus Alignment Period-Aware and Store Historical Snapshots

## Current Issues

1. **Hardcoded 7-day window**: `useContributionClassification` always queries the last 7 days of activity IDs, regardless of the period selector. The Focus Alignment chart never changes when you switch periods.

2. **Bar ordering confusion**: The stacked bar shows percentages. Stiffi has ~45% focus-aligned work (blue appears first, taking up half the bar). Others have ~1-3% aligned work, so the tiny blue sliver appears at the end after the large grey "Unaligned" segment. This is correct behavior but visually confusing — the bars should show focused work first (left) for everyone, which they do, but when the blue segment is tiny it just looks like a dot on the right edge.

3. **No historical storage**: Classification results are computed on-the-fly from `impact_classifications` rows. There's no snapshot mechanism to track how focus alignment evolves over time.

## Plan

### 1. Make `useContributionClassification` period-aware
**File:** `src/hooks/useTeamFocus.ts`

- Add `periodDays` parameter (default 7) to `useContributionClassification`
- Replace hardcoded `7` with `periodDays` in the date filter
- Include `periodDays` in the query key

### 2. Pass period from Dashboard & Analytics
**Files:** `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`

- Pass `PERIOD_DAYS[breakdownPeriod]` to `useContributionClassification(teamId, hasFocusItems, periodDays)`
- This makes the Focus Alignment chart respond to the period selector

### 3. Show period label on the Focus Alignment card
**File:** `src/components/analytics/FocusAlignment.tsx`

- Add optional `periodLabel` prop (e.g., "This Week", "This Quarter")
- Display it in the CardDescription: "How each member's work aligns with team focus areas — This Quarter"

### 4. Store historical focus alignment snapshots
**New migration**: Create a `focus_alignment_snapshots` table to store periodic snapshots of per-member focus alignment percentages. This enables future trend analysis, AI summaries, and period-over-period comparisons.

```sql
create table public.focus_alignment_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  breakdown jsonb not null,          -- { "EonTyre integration": 45, "Unaligned": 55 }
  total_activities int not null,
  created_at timestamptz default now(),
  unique(team_id, member_id, period_start, period_end)
);
alter table public.focus_alignment_snapshots enable row level security;
create policy "Authenticated users can read focus snapshots"
  on public.focus_alignment_snapshots for select to authenticated using (true);
```

### 5. Snapshot edge function
**New file:** `supabase/functions/snapshot-focus-alignment/index.ts`

- Accepts `team_id` and optional `period_start`/`period_end` (defaults to last 7 days)
- Queries `impact_classifications` joined with `team_focus` for the period
- Computes per-member breakdowns (same logic as the client hook)
- Upserts into `focus_alignment_snapshots`
- Can be called manually or via pg_cron weekly

### 6. Update `supabase/config.toml`
- Add `[functions.snapshot-focus-alignment]` entry

## Files to Change

| File | Change |
|------|--------|
| `src/hooks/useTeamFocus.ts` | Add `periodDays` param to `useContributionClassification` |
| `src/pages/Dashboard.tsx` | Pass period to classification hook |
| `src/pages/Analytics.tsx` | Pass period to classification hook |
| `src/components/analytics/FocusAlignment.tsx` | Add period label display |
| `supabase/migrations/` | New migration for `focus_alignment_snapshots` table |
| `supabase/functions/snapshot-focus-alignment/index.ts` | New snapshot edge function |
| `supabase/config.toml` | Register new function |

## Result
- Focus Alignment chart responds to the period selector
- Period label shown so users know what timeframe they're viewing
- Historical snapshots stored for future AI trend analysis and digests
- Longer periods show cumulative alignment data (always ≥ shorter periods)

