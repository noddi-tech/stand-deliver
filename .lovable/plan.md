

## Plan: Move Member Breakdown to top + embed Badge Guide inside it

### Changes

**`src/pages/Dashboard.tsx`**
- Move the Member Breakdown `<section>` from line 351-361 to right after the Header + Standup button (after line 139, before the Metrics Row)
- Remove the standalone `<BadgeLegend />` at line 364

**`src/components/team/MemberBreakdown.tsx`**
- Import and render `<BadgeLegend />` inside the `<Card>` at the bottom of `<CardContent>`, after the member grid (after line 156)
- Add a small top margin/separator before it

This keeps the Badge Guide contextually inside the breakdown card where badges are displayed, and puts the whole section at the top of the Dashboard for immediate visibility.

