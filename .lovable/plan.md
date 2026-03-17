

# Fix VIS normalization (log-scale) and align awards scoring

## Two changes

### 1. `src/hooks/useEnrichedAnalytics.ts` — Replace median normalization with log-scale (lines 196–209)

Replace the current linear median normalization block with the user's log-scale approach. This compresses the 50x raw score range naturally, produces differentiated scores, and is stable when team composition changes.

```typescript
// --- VIS Normalization: log-scale, median = 50 ---
const visMembers = members.filter((m) => m.hasVIS && m.codeImpactScore > 0);

if (visMembers.length > 0) {
  const logScores = visMembers.map((m) => Math.log10(m.codeImpactScore + 1));
  const sorted = [...logScores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  let logMedian = sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  if (logMedian === 0) logMedian = 1;

  for (const m of visMembers) {
    const logScore = Math.log10(m.codeImpactScore + 1);
    m.codeImpactScore = Math.round(
      Math.min(100, Math.max(5, (logScore / logMedian) * 50))
    );
  }

  for (const m of members) {
    if (m.hasVIS && m.codeImpactScore <= 0) {
      m.codeImpactScore = 0;
    }
  }
}
// --- End VIS Normalization ---
```

### 2. `src/hooks/useWeeklyAwards.ts` — Use VIS impact_classifications for awards

The `computeMemberStats` function (line 107-111) uses `Math.sqrt(adds + dels) * 2 + files * 1.5` for impact. Replace this with VIS data:

- Add a query for `impact_classifications` for the 2-week window (alongside existing queries, ~line 46)
- Build a per-member VIS score map from classifications
- In `computeMemberStats`, look up VIS score for each member; fall back to legacy formula only for members with zero classifications
- The MVP stat line (line 157) will then show VIS-based scores instead of raw legacy numbers

### Files modified
| File | Change |
|---|---|
| `src/hooks/useEnrichedAnalytics.ts` | Replace lines 196–209 with log-scale normalization |
| `src/hooks/useWeeklyAwards.ts` | Fetch `impact_classifications`, use VIS scores in `computeMemberStats` and award calculations |

