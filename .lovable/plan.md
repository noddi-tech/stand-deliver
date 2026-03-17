

# Fix VIS Score Mismatch & Badge Inconsistency

## Bug 1: Awards show "VIS: 532" while MemberBreakdown shows "54"

**Root cause**: Two completely different numbers being called "VIS":

- **Awards** (`useWeeklyAwards.ts` line 112): `impactScore` = raw sum of all `impact_score` values from `impact_classifications`. For Joachim that's ~532 (sum of all his individual scores like 59, 44, 49, 36, etc.).
- **MemberBreakdown** (`useWeeklyVIS.ts` line 168): `visTotal` = the normalized composite (0-100) computed via `computeVISTotal()`, which normalizes raw impact against the team median then weights it with delivery, multiplier, and focus.

The awards stat line says `VIS: 532` but 532 is **raw impact points**, not VIS. This is misleading.

**Fix**: In `useWeeklyAwards.ts` line 150, change the stat label from `VIS: ${mvp.impactScore}` to `Impact: ${mvp.impactScore}` — or better, compute a proper normalized VIS for the award display. The simplest correct fix: rename the label to "Impact" since it's the raw sum, not the VIS composite.

Also in the MVP composite formula (line 137), `m.impactScore` is the raw sum which can be hundreds, while `reviewsGiven * 20` and `commitmentsCompleted * 15` are tiny in comparison. This makes reviews and commitments nearly irrelevant. We should normalize impact to the 0-100 VIS scale before combining.

**Changes**:
- `src/hooks/useWeeklyAwards.ts`: After building `visScoreMap` (raw sums), compute a team median and normalize each member's score to `min(100, (raw / median) * 50)` before using it in the composite. This matches `useWeeklyVIS` normalization. Update the stat line to show the normalized value.

## Bug 2: MyAnalytics badges differ from MemberBreakdown badges

**Root cause**: Two different badge systems being shown:

- **MemberBreakdown** (line 136): Shows `MemberBadgeIcons` — these are **achievement badges** from the `useBadges` hook (First Commit, Shipper, Architect, etc. — gamification badges).
- **MyAnalytics** (`BadgeShowcase` component): Also shows achievement badges — same system. So these should match.
- **MemberBreakdown** (line 189): Shows `BadgeImpactBreakdown` — these are **activity badge** percentages (🐛 53%, 🚀 33%) from `useMemberBadgeCounts`.
- **MyAnalytics** (line 51): Shows `BadgeImpactBreakdown` from `useWeeklyVIS` — but this fetches ALL `activity_badges` for the team (no date filter on line 87 of useWeeklyVIS), then joins only to this-week's classifications. Meanwhile `useMemberBadgeCounts` filters badges to last 7 days.

The `useWeeklyVIS` badge query (line 84-87) fetches **all** activity_badges for the team with no date filter, while `useMemberBadgeCounts` filters to 7 days. This causes the join to produce different results because old badges match current-week classification activity_ids differently.

**Fix**: In `useWeeklyVIS.ts` line 84-87, the badge query doesn't need a date filter because it joins by `activity_id` to classifications that ARE date-filtered. So the badge data itself is correct. The real discrepancy is that `useMemberBadgeCounts` filters `external_activity` to 7 days and counts badge occurrences, while `useWeeklyVIS` weights by impact_score. They show different things — counts vs impact-weighted percentages — which is by design but confusing when both use the same visual component.

The actual visual mismatch: MemberBreakdown shows `🐛 53% 🚀 33% 🏗️ 14%` (impact-weighted from `useMemberBadgeCounts.impactPct`) while MyAnalytics shows `🔧 Chore 2% 🚀 Feature 0%` — the latter looks broken with near-zero values.

Let me check why MyAnalytics shows such low percentages — likely the `useWeeklyVIS` badge lookup is failing to match most activity_ids.

**Changes**:
- `src/hooks/useWeeklyVIS.ts`: The badge query fetches all team badges but the join is by `activity_id` from `impact_classifications`. The classifications use `activity_id` but the badges table may have different `activity_id` values if the `source_type` differs. Check if the join key is correct.
- Simplify: Make MyAnalytics use `useMemberBadgeCounts` for badge distribution (same source as MemberBreakdown) instead of deriving it from `useWeeklyVIS`.

## Implementation

| File | Change |
|---|---|
| `src/hooks/useWeeklyAwards.ts` | Normalize `impactScore` to 0-100 scale (raw/median*50) before composite. Fix stat label. |
| `src/hooks/useWeeklyVIS.ts` | Fix badge lookup: filter badges query to match classifications' activity_ids only. Or remove badge logic from this hook entirely since `useMemberBadgeCounts` already handles it. |
| `src/pages/MyAnalytics.tsx` | Use `useMemberBadgeCounts` for badge distribution instead of `useWeeklyVIS.badgeImpactPct` — ensures same data as MemberBreakdown. |

