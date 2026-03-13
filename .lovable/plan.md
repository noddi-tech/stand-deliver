

# Incremental Improvements for StandFlow

After reviewing every page and component, here are targeted improvements that boost UI/UX quality without breaking existing functionality.

---

## 1. Dashboard: Remove duplicate Team Members section

The Dashboard currently renders both `MemberBreakdown` (top) and a separate "Team Members" section (bottom). These show overlapping information. Remove the bottom Team Members section since MemberBreakdown is richer and already at the top.

**File:** `src/pages/Dashboard.tsx` — Remove the entire "Team Members" `<section>` (lines 338-390).

---

## 2. Sidebar: Remove duplicate sign-out button

The sidebar has sign-out in both the user dropdown (line 113) AND the footer (lines 164-172). Remove the footer sign-out to reduce clutter.

**File:** `src/components/AppSidebar.tsx` — Remove the footer `<Button>` for sign out.

---

## 3. Sidebar: Add missing pages to navigation

`My Analytics`, `Team Insights`, and `Weekly Digest` are routed but not in the sidebar nav. Users can only reach them via deep links or command palette.

**File:** `src/components/AppSidebar.tsx` — Add nav items for `/my-analytics`, `/team-insights`, and `/weekly-digest`.

---

## 4. Analytics: Remove standalone BadgeLegend

The `BadgeLegend` is already embedded inside `MemberBreakdown`. The Analytics page renders it a second time as a standalone card (line 150). Remove the duplicate.

**File:** `src/pages/Analytics.tsx` — Remove standalone `<BadgeLegend />` (line 150) and its import.

---

## 5. Dashboard: Time-aware greeting

Replace the static "Welcome back" with a time-of-day greeting: "Good morning", "Good afternoon", or "Good evening".

**File:** `src/pages/Dashboard.tsx` — Add a simple greeting function based on `new Date().getHours()`.

---

## 6. Loading states: Add page-level skeleton for Dashboard

When `teamLoading` is true, the Dashboard shows a partially loaded page with empty sections. Add a cohesive skeleton layout for the initial load.

**File:** `src/pages/Dashboard.tsx` — Wrap the return in an early-return skeleton when `teamLoading` is true.

---

## 7. Empty Attention section: Reduce vertical space

The "All clear" empty state uses `py-16` from the shared `EmptyState` component. For the attention section, this is too tall. Pass a smaller padding or use inline empty state.

**File:** `src/pages/Dashboard.tsx` — Replace `EmptyState` for attention with a compact inline message.

---

## 8. NotFound page: Use theme-consistent background

NotFound uses `bg-muted` which looks disconnected. Switch to `bg-background` and add a back button.

**File:** `src/pages/NotFound.tsx` — Update styling and add a proper back navigation button.

---

## 9. Activity page: Show "today/yesterday" labels for date groups

The Activity page uses `format(date, "EEEE, MMM d")` for all dates. Add "Today" and "Yesterday" labels like the TeamFeed page already does.

**File:** `src/pages/Activity.tsx` — Reuse the `formatDateHeader` pattern from TeamFeed.

---

## 10. QueryClient: Add sensible defaults

The QueryClient has no defaults, meaning every query refetches on window focus and has no default staleTime. Add reasonable defaults to reduce unnecessary network calls.

**File:** `src/App.tsx` — Add `defaultOptions` with `staleTime: 60_000` and `refetchOnWindowFocus: false`.

---

## Summary of files to change

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Remove duplicate Team Members, time-aware greeting, compact attention empty state, loading skeleton |
| `src/components/AppSidebar.tsx` | Add missing nav items, remove duplicate sign-out |
| `src/pages/Analytics.tsx` | Remove standalone BadgeLegend |
| `src/pages/NotFound.tsx` | Theme-consistent styling, back button |
| `src/pages/Activity.tsx` | Today/Yesterday date labels |
| `src/App.tsx` | QueryClient defaults |

All changes are additive or cosmetic — no functional behavior changes, no database changes, no new dependencies.

