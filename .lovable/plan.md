

# Normalize VIS scores to 0–100 in useEnrichedAnalytics

## Problem
`codeImpactScore` is set to raw `visScore + unclassifiedImpact` — an unbounded sum. Members show scores like 78018, 50110, 11921 instead of 0–100.

## Fix
Insert a normalization block after the `for` loop that builds the `members` array (after line 194) and before the "Team averages" section (line 196). This computes the team median from VIS-enabled members' raw scores and normalizes each to 0–100 where median = 50, matching `compute-weekly-vis` server-side logic.

### File: `src/hooks/useEnrichedAnalytics.ts`
Insert between lines 194 and 196:
```typescript
// --- VIS Normalization: convert raw sums to 0–100 scale ---
const rawScores = members.filter((m) => m.hasVIS).map((m) => m.codeImpactScore);
if (rawScores.length > 0) {
  const sorted = [...rawScores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  let median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  if (median === 0) median = 1;
  for (const m of members) {
    if (m.hasVIS) {
      m.codeImpactScore = Math.round(Math.min(100, Math.max(0, (m.codeImpactScore / median) * 50)));
    }
  }
}
// --- End VIS Normalization ---
```

No other files need changes — MemberBreakdown already shows "VIS" label when `hasVIS` is true.

