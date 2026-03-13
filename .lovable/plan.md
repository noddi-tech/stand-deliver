

## Investigation Results

**Badges ARE working!** The `detect-badges` function has successfully awarded 19 badges across all team members (Architect 🏗️, Shipper 📦, Streak 🔁, Janitor 🧹, First Commit 🌱). The data is in the database AND the API returns it to the frontend.

**Why they don't show:** The `badge_definitions` table query is cached empty from before the definitions were seeded. The `useBadgeDefinitions` hook has a 1-hour `staleTime`, so it cached an empty result and never re-fetched. Since `badgeLookup` is `{}`, `MemberBadgeIcons` returns `null` for every badge because `lookup[b.badge_id]` is undefined.

## Plan

### Fix 1: Reduce badge definitions cache time + force refresh
In `src/hooks/useBadges.ts`, reduce `staleTime` from 1 hour to 5 minutes for `useBadgeDefinitions`, and add a check: if definitions are empty but badges exist, invalidate the query.

### Fix 2: Add Member Breakdown section to Dashboard
Move the Member Breakdown card (currently only on Analytics) into a shared component, then render it on Dashboard below the Team Members section. This gives leads a quick view of each member's stats, badges, and AI highlights without navigating to Analytics.

### Fix 3: Create a Badge Legend / Info section
Add a collapsible "Badge Guide" section that shows all 10 badge definitions with their emoji, name, description, and criteria. This can be shown:
- In the Analytics Member Breakdown (as an expandable section)
- On Dashboard when the member breakdown is expanded

### Fix 4: Improve Analytics loading performance
The Analytics page is slow because `ai-team-summary` makes a full AI call on every load. Add `staleTime` to the summary query so it caches for a reasonable period and doesn't re-call the AI every time you click into Analytics.

### Files to change

| File | Change |
|------|--------|
| `src/hooks/useBadges.ts` | Reduce staleTime, add fallback refetch logic |
| `src/components/badges/BadgeLegend.tsx` | New component: collapsible grid of all badge definitions |
| `src/components/team/MemberBreakdown.tsx` | New shared component extracted from Analytics member breakdown |
| `src/pages/Dashboard.tsx` | Add MemberBreakdown component |
| `src/pages/Analytics.tsx` | Extract member breakdown to shared component, add BadgeLegend, increase staleTime on summary query |

