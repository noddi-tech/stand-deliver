

# Update /vis-explained for Absolute-Baseline Scoring

## What's stale

The Impact component description (line 44) says:
> "Your individual scores are summed, then log-compressed and normalized against the team median. The median maps to 50, with a floor of 5 for any active contributor"

This describes the old system. The new absolute-baseline model normalizes against a per-team `reference_baseline` stored in `vis_config`, not the team median.

## Changes

### `src/pages/VISExplained.tsx`

**1. Impact description (line 43-44)** — Replace the normalization paragraph:

Old: "...summed, then log-compressed and normalized against the team median. The median maps to 50, with a floor of 5..."

New: "Every contribution — commits, PRs, tasks, standup commitments — is automatically classified by AI into one of four tiers. Each item also gets a value type and a focus alignment tag. The AI classifies the outcome, not the method — work shipped via Lovable, v0, or Cursor is scored the same as hand-written code. Your individual scores are summed into a raw impact total, then normalized against your team's reference baseline using a log scale: `log10(raw + 1) / log10(baseline + 1) × 60`. The baseline represents a solid week of output, calibrated from your team's actual history. Hitting the baseline scores ~60 on this component. The log scale means a 10× difference in raw output shows up as a moderate score gap, not a 10× gap — keeping scores stable even on small teams."

**2. "What VIS is NOT" section** — Add a new item about the baseline:

```
{
  title: "It's not relative to teammates",
  description: "Your score is measured against an absolute baseline — a 'solid week' calibrated from team history — not against what others did this week. Two people doing the same work get the same score, regardless of team size."
}
```

**3. Tips section** — Update the mid-week estimate tip (line 101-103) to mention calendar week boundaries:

Old: "The canonical score is computed Sunday night from the full week's data. During the week you see an estimate that updates every 5 minutes."

New: "The canonical score is computed Sunday night from the full Monday–Sunday week. During the week you see a live estimate. On Monday morning, if the current week has no data yet, you'll see last week's scores until new classifications come in."

## Files changed

| File | Change |
|------|--------|
| `src/pages/VISExplained.tsx` | Update Impact description, add baseline NOT item, update mid-week tip |

