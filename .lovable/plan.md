

# Fix: MemberBreakdown shows only "chore" badge despite diverse activity

## Root Cause

Database evidence shows Anders Liland has **30 activities** with diverse badges (feature ×8, chore ×12, refactor ×3, bugfix ×3, infra ×1), but only **4 of those 30** have `impact_classifications` entries — and all 4 happen to be "chore". 

The MemberBreakdown component uses `badgeImpactPct` (impact-weighted percentages from `useMemberBadgeCounts`), which joins badges with `impact_classifications`. Since only 4 chore-badged activities have classification rows, the result is 100% chore — completely misrepresenting Anders' actual work.

The Activity page shows all badges correctly because it reads directly from `activity_badges` without requiring an impact classification join.

## Fix

**Use count-based badge percentages as the primary display in MemberBreakdown**, since counts reflect ALL classified activities, not just the subset with impact scores.

### Changes

| File | Change |
|---|---|
| `src/hooks/useMemberBadgeCounts.ts` | Add `countPct` output: convert existing `counts` to percentages (count per badge / total count × 100) |
| `src/components/team/MemberBreakdown.tsx` | Use `countPct` (from badge counts) instead of `badgeImpactPct`. Fall back to `badgeImpactPct` only if `countPct` is empty. |

### Detail

In `useMemberBadgeCounts`, after building `counts` (line 60-66), compute:
```
countPct[memberId][badgeKey] = (badgeCount / totalBadgesForMember) * 100
```

This gives Anders: feature ~27%, chore ~40%, refactor ~10%, bugfix ~10%, infra ~3% — accurately reflecting what the Activity page shows.

In `MemberBreakdown` line 187, prefer `badgeCountPct[memberId]` over `badgeImpactPct[memberId]`.

This is a ~15-line change across 2 files.

