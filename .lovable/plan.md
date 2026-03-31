

# VIS Unified Scoring Overhaul (Refined)

## Overview

Replace the dual normalization system (linear for weekly cron/hook, log-scale for analytics/awards/digest) with a single absolute-baseline formula. Every view shows the same VIS number.

## Critical Constraint: Atomic Deployment (Refinement #1)

Steps 2–7 MUST deploy together as one atomic change. The `computeVISTotal` signature changes from `{ normalizedImpact }` to `{ rawImpact } + referenceBaseline`. If any caller still passes pre-normalized impact while the function expects raw (or vice versa), scores will be wildly wrong (0.001 or 9000).

**All of these must ship in one commit:**
- `supabase/functions/_shared/scoring.ts`
- `src/lib/scoring.ts`
- `src/test/scoring.test.ts`
- `supabase/functions/compute-weekly-vis/index.ts`
- `src/hooks/useWeeklyVIS.ts`
- `src/hooks/useEnrichedAnalytics.ts`
- `src/hooks/useWeeklyAwards.ts`
- `supabase/functions/ai-weekly-digest/index.ts`

---

## Step 1: Create `vis_config` table with auto-calibrated seed (Refinement #2)

**Migration SQL:**

```sql
CREATE TABLE vis_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE UNIQUE,
  reference_baseline numeric NOT NULL DEFAULT 100,
  calibrated_at timestamptz DEFAULT now()
);

ALTER TABLE vis_config ENABLE ROW LEVEL SECURITY;

-- Team members can read (hooks need this)
CREATE POLICY "Team members can view vis_config"
  ON vis_config FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));

-- Team leads can update baseline
CREATE POLICY "Team leads can update vis_config"
  ON vis_config FOR UPDATE TO authenticated
  USING (is_team_lead(auth.uid(), team_id));

-- Service role bypasses RLS (Refinement #3) — no extra policy needed.
-- Edge functions (compute-weekly-vis, ai-weekly-digest) use service role key.

-- Auto-calibrate from actual data, not a guess
INSERT INTO vis_config (team_id, reference_baseline, calibrated_at)
SELECT
  t.id,
  COALESCE(
    percentile_cont(0.5) WITHIN GROUP (ORDER BY weekly_raw.total),
    100
  ),
  now()
FROM teams t
LEFT JOIN LATERAL (
  SELECT member_id, SUM(impact_score) as total
  FROM impact_classifications
  WHERE team_id = t.id
    AND created_at > now() - interval '30 days'
  GROUP BY member_id, date_trunc('week', created_at)
) weekly_raw ON true
GROUP BY t.id
ON CONFLICT (team_id) DO NOTHING;
```

---

## Steps 2–7: Atomic Scoring Overhaul (ONE deployment)

### 2. Rewrite `computeVISTotal` — both copies + tests

**`supabase/functions/_shared/scoring.ts` + `src/lib/scoring.ts`:**

- `computeImpactScore` — unchanged
- `computeVISTotal` — new signature:

```typescript
export function computeVISTotal(
  components: {
    rawImpact: number;
    deliveryScore: number;
    multiplierScore: number;
    focusRatio: number;
  },
  referenceBaseline: number = 100
): number {
  const logRef = Math.log10(referenceBaseline + 1);
  const normalizedImpact = logRef > 0
    ? Math.min(100, Math.max(0, (Math.log10(components.rawImpact + 1) / logRef) * 60))
    : 0;
  const total =
    normalizedImpact * 0.40 +
    components.deliveryScore * 0.30 +
    components.multiplierScore * 0.15 +
    components.focusRatio * 0.15;
  return Math.round(Math.max(0, Math.min(100, total)) * 100) / 100;
}
```

**`src/test/scoring.test.ts`:** Update all `computeVISTotal` tests to pass `rawImpact` instead of `normalizedImpact`. Add test cases validating reference baseline behavior (baseline=100 → rawImpact=100 produces ~60 normalized impact → VIS ~24 from impact component alone).

### 3. Update `compute-weekly-vis` cron

- Fetch `reference_baseline` from `vis_config` for each team (service role, bypasses RLS)
- Remove median calculation (lines 103-109)
- Pass `rawImpact` + baseline to `computeVISTotal` instead of pre-computing `normalizedImpact`
- Store `normalizedImpact` in breakdown for display (compute it inline for the record)

### 4. Update `useWeeklyVIS` hook

- Fetch `vis_config` for the team (new query, or piggyback on existing team query)
- Remove the "fetch ALL team members' classifications for median" block (lines ~100-130 in current code)
- Pass `rawImpact` + `referenceBaseline` to `computeVISTotal`

### 5. Update `useEnrichedAnalytics`

- Remove the inline log-scale normalization block (lines 199-223 in `useEnrichedTeamMetrics`)
- Fetch `vis_config.reference_baseline` for the team
- Use `computeVISTotal({ rawImpact: visScore, ... }, baseline)` per member
- `codeImpactScore` now comes from the unified formula

### 6. Update `useWeeklyAwards`

- Remove `logScaleNormalize` function (lines 6-23)
- Fetch `vis_config.reference_baseline`
- In `computeMemberStats`, use the unified formula: `normalizedImpact = min(100, max(0, (log10(raw+1) / log10(baseline+1)) * 60))` for each member's impact score
- MVP composite uses the same normalized score

### 7. Update `ai-weekly-digest`

- Remove `logScaleNormalize` function (lines 292-309)
- Fetch `vis_config.reference_baseline` using service role
- Apply same formula inline for awards computation
- **Add `member_vis` snapshot** to the digest JSONB: for each member, store `{ member_id, member_name, vis_total, breakdown }` so the WeeklyDigest page reads frozen numbers

---

## Step 8: Acceptance Test

After the cron fires, run this verification query:

```sql
SELECT member_id, week_start, array_agg(DISTINCT vis_total) as scores
FROM weekly_vis_scores
WHERE week_start = (SELECT MAX(week_start) FROM weekly_vis_scores)
GROUP BY member_id, week_start;
```

Every member should have exactly one score. Then spot-check that Dashboard, Team Insights, and Weekly Digest show those same numbers.

---

## Step 9: Incremental Improvements (independently shippable)

Each of these is a separate follow-up, not part of the atomic deployment:

**9a. Weighted Delivery Score** — weight commitments by impact tier (`critical:4, high:2, standard:1, low:0.5`). Requires joining `commitments` to `impact_classifications` by `activity_id`. Apply in both cron and hook.

**9b. Review Depth Multiplier** — `reviewPoints = 5 + min(15, comments×3)` per review from `metadata.review_comments`. Cap at 100. Apply in both cron and hook.

**9c. Work Type Macro-Categories** — replace 5 old types in `useEnrichedAnalytics` workTypeDist with: Ship (feature/hotfix/design/style), Quality (bugfix/test/security/perf), Foundation (refactor/infra/chore/docs), Growth (growth), Collaborate (review/review_deep/review_light/unblock).

**9d. Richer Team Insights Celebrations** — derive from VIS components + badge distributions instead of just completion rate / blocker count.

**9e. VIS Sparkline on Member Cards** — `useVISTrend` hook querying last 8 `weekly_vis_scores` rows, tiny sparkline in `MemberBreakdown`.

---

## Files Changed (Steps 1-8)

| Step | File | Change |
|------|------|--------|
| 1 | Migration | Create `vis_config`, auto-calibrate seed |
| 2 | `supabase/functions/_shared/scoring.ts` | New `computeVISTotal` signature |
| 2 | `src/lib/scoring.ts` | Mirror |
| 2 | `src/test/scoring.test.ts` | Updated tests |
| 3 | `supabase/functions/compute-weekly-vis/index.ts` | Read baseline, remove median, use new formula |
| 4 | `src/hooks/useWeeklyVIS.ts` | Read baseline, remove all-team fetch, use new formula |
| 5 | `src/hooks/useEnrichedAnalytics.ts` | Remove log-scale block, use unified formula |
| 6 | `src/hooks/useWeeklyAwards.ts` | Remove `logScaleNormalize`, use unified formula |
| 7 | `supabase/functions/ai-weekly-digest/index.ts` | Remove `logScaleNormalize`, use unified formula, snapshot `member_vis` |

