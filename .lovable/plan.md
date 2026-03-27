

# Fix AI Confusing Commitment Completion with Standup Participation

## Problem
The AI highlight for Joachim says "low 33% standup completion rate" when his standup participation is actually 75%. The AI is conflating `commitments.completionRate` (task completion) with `standup.participationRate` (standup submissions).

## Root Cause
In `supabase/functions/ai-team-summary/index.ts`, the prompt sends both metrics but doesn't explicitly warn the AI about the distinction. The JSON field names (`completionRate` under `commitments`, `participationRate` under `standup`) are clear to a developer but the AI muddles them.

## Fix

**`supabase/functions/ai-team-summary/index.ts` (~line 201-216)**

Add a clarifying rule to the prompt:

```
6. IMPORTANT DISTINCTION: "completionRate" under "commitments" is the percentage of TASKS completed — NOT standup completion. "participationRate" under "standup" is the percentage of standup sessions the member submitted. Never confuse these two metrics. When discussing standups, use participationRate. When discussing task delivery, use completionRate.
```

This is a single line addition to the `CRITICAL RULES` section of the prompt. No structural changes needed.

## Files Changed
| File | Change |
|------|--------|
| `supabase/functions/ai-team-summary/index.ts` | Add rule 6 clarifying metric distinction |

