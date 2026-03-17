

# Update VIS Explained page with log-scale normalization details

## What's outdated
The Impact component description (line 48) says scores are "compared to the team median" but doesn't explain **how**. With the log-scale normalization now in place, the page should clarify:
- Raw impact scores are log-compressed before normalization (handles 50x range between members)
- Median maps to 50, with a floor of 5 for active contributors
- This means a 12-line critical fix and a 3,000-line boilerplate migration are differentiated by tier, not volume

## Change

### File: `src/pages/VISExplained.tsx`

Update the Impact `description` (COMPONENTS array, first entry, ~line 48) to:

```
"Every contribution — commits, PRs, tasks, standup commitments — is automatically classified by AI into one of four tiers. Each item also gets a value type and a focus alignment tag. The AI classifies the outcome, not the method — work shipped via Lovable, v0, or Cursor is scored the same as hand-written code. Your individual scores are summed, then log-compressed and normalized against the team median. The median maps to 50, with a floor of 5 for any active contributor — so you'll never see a 0 if you shipped real work. The log scale means a 10x difference in raw output shows up as a modest score gap, not a 10x score gap. This keeps scores meaningful even on small teams."
```

Single file, single string change.

