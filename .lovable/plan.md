

## Problem

The "Needs Attention" section currently only checks for:
1. Commitments carried 2+ times
2. Blockers open for 2+ days

It never checks for **missing standups**, so it's almost always empty. The user wants it to surface things like members who haven't submitted today, members who are overdue, and heavy carry-over patterns.

## Plan

### Expand `useAttentionItems.ts` to include 3 new attention categories

**a) Missing standups today** — members who haven't submitted a standup when a session exists (or it's a workday and no session yet). Query `team_members` + today's `standup_responses` to find members with `submissionStatus === "pending"`.

**b) Stale members** — members whose last standup response was 3+ workdays ago. Query latest `standup_responses` per member and flag those with old `submitted_at`.

**c) Heavy carriers** — keep existing carry_count >= 2 logic (already there).

### New return shape

```ts
{
  commitments: AttentionCommitment[],   // existing
  blockers: AttentionBlocker[],          // existing
  missingStandups: AttentionMember[],    // NEW: no standup today
  staleMembers: AttentionMember[],       // NEW: 3+ days since last standup
}
```

### Update Dashboard rendering

In `src/pages/Dashboard.tsx`, update the "Needs Attention" section to:
- Show missing standup cards (⏳ icon, amber border) — "{Name} hasn't submitted today's standup"
- Show stale member cards (🔇 icon) — "{Name} hasn't checked in for {N} days"
- Update the empty check to include all 4 categories
- Reduce the empty state padding since it currently takes up too much vertical space

### Files to change

| File | Change |
|------|--------|
| `src/hooks/useAttentionItems.ts` | Add missing standup + stale member queries |
| `src/pages/Dashboard.tsx` | Render new attention item types, reduce empty state padding |

