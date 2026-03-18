

# Integrate Activity Badges into VIS System + Update VIS Explained

## Concept

Activity badges already classify *what type* of work was done (🐛 Bug Fix, 🚀 Feature, etc.). Integrating them into VIS makes the score more transparent: instead of just seeing "Impact: 72", you see *where* that impact came from — "40% from Features, 30% from Bug Fixes, 20% from Reviews." This gives actionable insight into who fixes what, who ships what, and whether that aligns with team priorities.

## 1. Enrich `compute-weekly-vis` with Badge Distribution

**`supabase/functions/compute-weekly-vis/index.ts`**

After fetching `impact_classifications` (line 65), also fetch `activity_badges` for the same week/team. Join badge data to classifications by `activity_id` to build a per-member breakdown: `Record<string, number>` mapping badge_key to summed impact_score.

Add to the existing `breakdown` jsonb (line 154):
```ts
breakdown: {
  ...existingFields,
  badgeDistribution: { feature: 45.2, bugfix: 22.1, refactor: 8.0, ... },
  badgeImpactPct: { feature: 40, bugfix: 30, refactor: 10, ... },
}
```

No schema migration needed — `breakdown` is already a `jsonb` column.

## 2. Enrich `useWeeklyVIS` Client Hook

**`src/hooks/useWeeklyVIS.ts`**

- Add `badgeDistribution?: Record<string, number>` to `VISBreakdown` interface
- For canonical (past) weeks: read from `breakdown.badgeDistribution`
- For current week estimate: fetch `activity_badges` for the week alongside `impact_classifications`, join by `activity_id`, aggregate badge_key → impact_score sums

## 3. Show Badge-Impact Distribution in Dashboard/MyAnalytics

**New component: `src/components/analytics/BadgeImpactBreakdown.tsx`**

A compact horizontal stacked bar or pill row showing what % of a member's impact came from each badge type. Uses `ALL_BADGES` for emoji lookup. Example rendering:

```
Impact sources: 🚀 40%  🐛 30%  🔧 15%  🔀 10%  🧹 5%
```

Wire into:
- **Dashboard.tsx**: Show below VIS score in MemberBreakdown cards (via the `badgeCounts` prop or a new `badgeImpact` prop)
- **MyAnalytics.tsx**: Add a "Where Your Impact Comes From" card using `useWeeklyVIS` badge distribution data

## 4. Update VIS Explained Page

**`src/pages/VISExplained.tsx`**

Add two new sections:

### "Activity Badges" section (after "Impact tiers")
- Explain that every contribution is automatically tagged with an activity badge (🐛 Bug Fix, 🚀 Feature, 🔧 Refactor, etc.)
- 4-layer priority: Manual > Deterministic rules > AI classification > Source defaults
- Badges map to value types but are more granular — they show *what kind* of work within each tier
- Include a subset grid of the most common badges with emoji + label

### "Where Your Impact Comes From" section (after Activity Badges)
- Explain that VIS now tracks which badge types contributed to your Impact score
- "If 60% of your impact came from Bug Fixes and only 10% from Features, that's a signal — are you in a stabilization phase, or is new feature work getting stuck?"
- Clarify this is informational, not a penalty — all badge types contribute equally to the score formula

## Files Summary

| File | Change |
|---|---|
| `supabase/functions/compute-weekly-vis/index.ts` | Fetch activity_badges, compute badge distribution, include in breakdown jsonb |
| `src/hooks/useWeeklyVIS.ts` | Add `badgeDistribution` to VISBreakdown, compute in estimate path |
| `src/components/analytics/BadgeImpactBreakdown.tsx` | Create — badge-impact pill/bar visualization |
| `src/pages/MyAnalytics.tsx` | Add "Where Your Impact Comes From" card |
| `src/pages/Dashboard.tsx` | Wire badge impact data to MemberBreakdown |
| `src/pages/VISExplained.tsx` | Add "Activity Badges" and "Impact Sources" sections |

