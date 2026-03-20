

# Add Skeleton Loading for AI Highlights in Member Breakdown

## Problem
When switching periods or on initial load, the member cards show stats immediately (from `useTeamMemberStats`) but the AI-generated highlights (sentiment badges and italic quote text) appear blank until the slower AI summary returns. There's no loading indicator for this.

## Solution
Pass `summaryLoading` to `MemberBreakdown` and show skeleton placeholders where highlights will appear while the AI is loading.

## Changes

### 1. `src/components/team/MemberBreakdown.tsx`
- Add `highlightsLoading?: boolean` prop
- When `highlightsLoading` is true and no highlight exists for a member, render:
  - A small skeleton pill where the sentiment badge appears (top-right)
  - A skeleton text block (2 lines) where the highlight quote appears (bottom of card)

### 2. `src/pages/Dashboard.tsx`
- Pass `highlightsLoading={summaryLoading}` to `MemberBreakdown`

### 3. `src/pages/Analytics.tsx`
- Pass `highlightsLoading={summaryLoading}` to `MemberBreakdown` (if it also renders one)

Two files changed, minimal additions — just skeleton elements gated on a new boolean prop.

