

# Unified Data Pipeline — Red Thread Refactor

## Summary of Inconsistencies Found

After reading all files, here's what needs fixing:

| Problem | Where | Details |
|---|---|---|
| **Legacy impact scoring** (`computeCodeImpact`) | `useEnrichedAnalytics.ts` lines 48-54, 166-176 | Blends VIS + sqrt-based legacy for unclassified commits. Awards in `ai-weekly-digest` use the same legacy formula (line 226). |
| **Work types from `metadata.work_type`** | `useEnrichedAnalytics.ts` lines 154-159, 263-268 | Should use `activity_badges` instead. Same issue in personal metrics (lines 388-394). |
| **DORA computed 3 separate times** | `useWeeklyAwards.ts`, `useEnrichedAnalytics.ts`, `ai-weekly-digest/index.ts` | Three independent cycle-time/review calculations with slightly different logic. |
| **Awards computed 2 separate times** | `useWeeklyAwards.ts` (client, VIS-based) vs `ai-weekly-digest` (server, legacy sqrt-based) | Different formulas produce different winners. |
| **WeeklyDigest reads stale JSONB** | `WeeklyDigest.tsx` line 225 | Always reads from stored `cross_platform_activity.weekly_awards` — never uses live `useWeeklyAwards`. |
| **Digest work_distribution uses title regex** | `ai-weekly-digest` lines 78-85 | Matches "bug"/"fix"/"refactor" in commitment titles instead of `activity_badges`. |

## Implementation Plan

### Step 1: Create `useTeamMomentum` hook

**New file: `src/hooks/useTeamMomentum.ts`**

Extract DORA metrics computation (cycle time, merge rate, review turnaround, week-over-week trends) into a standalone hook. Takes `teamId`, fetches `external_activity` for current + previous week (GitHub, `pr_merged`/`pr_opened`/`pr_review`), returns `{ avgPRCycleTime, prsMerged, reviewTurnaround, weekOverWeekTrends }`.

This becomes the single source of truth for momentum metrics.

### Step 2: Update `useEnrichedAnalytics.ts`

- **Remove `computeCodeImpact` function entirely** (lines 48-54). For members without VIS classifications, show score 0 instead of a fake heuristic.
- **Remove the blended score logic** (lines 161-176) — just use `visScore` directly.
- **Replace `metadata.work_type` with `activity_badges`**: Fetch `activity_badges` for the team (7d/30d), join to `external_activity` by `activity_id`. Use `badge_key` for both per-member `workTypeBreakdown` and the weekly `workTypeDist` trend.
- **Remove duplicate DORA** (`teamAvgCycleTime`, `teamAvgReviewVelocity`) — consumers should use `useTeamMomentum` instead.

### Step 3: Update `useWeeklyAwards.ts`

- Import and use `useTeamMomentum` for DORA metrics instead of computing its own.
- Keep the awards computation as-is (it already uses `impact_classifications` / VIS).

### Step 4: Update `WeeklyDigest.tsx` — live/frozen fallback

**Rule**: If `digest.week_start` equals the current week's Monday (`getWeekStart(new Date())`), use live `useWeeklyAwards()`. Otherwise, read from stored `digest.weekly_awards` / `digest.dora_metrics` JSONB. Past digests are frozen snapshots — correct behavior.

Changes:
- Import `useWeeklyAwards` and `useTeamMomentum`.
- Compute `currentWeekStart` using the same Monday logic.
- If `digest.week_start === currentWeekStart`: use live awards + live DORA.
- Else: use `digest.weekly_awards` and `digest.dora_metrics` (existing behavior).
- Render awards using a unified component shape (normalize `memberName` vs `member_name` key differences between live and stored).

### Step 5: Wire `useTeamMomentum` into Dashboard and TeamInsights

**`Dashboard.tsx`**: Add a compact Team Momentum row (3 metric cards: cycle time, PRs merged, review turnaround) using `useTeamMomentum`. Currently Dashboard shows no DORA at all.

**`TeamInsights.tsx`**: Replace `awardsData?.doraMetrics` with `useTeamMomentum()` so it uses the shared hook instead of piggybacking on `useWeeklyAwards`.

### Step 6: Replace raw badge counts with impact-weighted view on MemberBreakdown

**`MemberBreakdown.tsx`**: Replace the `🚀×12 🐛×8` raw count line (lines 182-199) with the `BadgeImpactBreakdown` component (compact mode). This requires passing `badgeImpactPct` per member from `useWeeklyVIS` data or from a batch version.

Since `useWeeklyVIS` is per-member and we need all members at once, create a lightweight batch query in `useMemberBadgeCounts.ts` that also returns impact-weighted percentages (join `activity_badges` to `impact_classifications` by `activity_id`). The existing `useMemberBadgeCounts` already fetches badge counts — extend it to also sum `impact_score` per badge_key per member.

### Step 7: Update `ai-weekly-digest` edge function

This is critical — without it, the next stored digest will have legacy data.

**`supabase/functions/ai-weekly-digest/index.ts`** changes:

1. **Work distribution** (lines 78-85): Replace title-regex classification with `activity_badges` query. Fetch `activity_badges` for the team + week, count by `badge_key`, store as `work_distribution`.

2. **Awards** (lines 205-313): Replace the legacy `sqrt(adds + dels)` impact formula with VIS-based scoring. Fetch `impact_classifications` for the week, aggregate per member, use VIS scores for the MVP composite. This aligns server-generated awards with client-side `useWeeklyAwards`.

3. **DORA metrics** (lines 158-201): Keep as-is (server-side computation is fine for the snapshot), but ensure the same cycle-time formula is used.

4. **Badge impact in digest JSONB**: Add `badgeImpactPct` to the stored digest so historical views can show badge breakdown without recomputation.

### Step 8: Add time-window labels

Add small `<Badge>` labels to section headers across pages:
- Dashboard MemberBreakdown: "This week"
- Analytics engineering metrics: "Last 30 days"
- TeamInsights awards: "This week"
- WeeklyDigest: already shows date range

## Files Summary

| File | Change |
|---|---|
| `src/hooks/useTeamMomentum.ts` | **Create** — single DORA metrics hook |
| `src/hooks/useEnrichedAnalytics.ts` | Remove `computeCodeImpact`, use VIS-only; use `activity_badges` for work types; remove DORA |
| `src/hooks/useWeeklyAwards.ts` | Use `useTeamMomentum`; keep awards as-is |
| `src/hooks/useMemberBadgeCounts.ts` | Extend to return impact-weighted badge percentages |
| `src/pages/Dashboard.tsx` | Add momentum row via `useTeamMomentum` |
| `src/pages/Analytics.tsx` | Use `useTeamMomentum` for engineering metrics row |
| `src/pages/TeamInsights.tsx` | Use `useTeamMomentum` for DORA card |
| `src/pages/WeeklyDigest.tsx` | Live awards for current week, frozen for past; use `useTeamMomentum` |
| `src/components/team/MemberBreakdown.tsx` | Replace raw counts with impact-weighted badges; add time label |
| `supabase/functions/ai-weekly-digest/index.ts` | Use VIS for awards, `activity_badges` for work dist, store `badgeImpactPct` |

