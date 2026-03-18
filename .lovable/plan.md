

# Fix Over-Generous Focus Alignment Classification

## Problem

The AI classifier is incorrectly marking Tom Arne's "Setup 2x Trønderdekk Dintero accounts" as **direct alignment** with "EonTyre integration" because the focus item description mentions Trønderdekk:

> *"Creating a two-way API integration with EonTyre for Trønderdekk to enable them using Navio..."*

The AI sees "Trønderdekk" and assumes any work involving that customer is EonTyre-related. But setting up Dintero (payment provider) accounts is general partner onboarding — not EonTyre API integration work. This causes Tom Arne to show ~100% blue on the Focus Alignment chart (since it's his only classified activity in certain periods).

Database confirms: Tom Arne has 4 classified activities — 3 correctly marked `none`, 1 incorrectly marked `direct` for Dintero setup. In shorter periods where only the Dintero task falls in range, he shows 100% aligned.

## Root Cause

The AI prompt's focus context includes the full description with customer names. The classification rules say "Do NOT hallucinate focus alignment" but the AI still matches on customer/partner names rather than the actual work being done (API integration vs payment setup).

## Plan

### 1. Tighten the AI classification prompt
**File:** `supabase/functions/ai-classify-contributions/index.ts`

Add an explicit rule to the `CLASSIFICATION RULES` section:

```
- Focus alignment means the WORK ITSELF advances the focus objective,
  not merely that it involves the same customer/partner/project.
  Example: If the focus is "EonTyre API integration for Trønderdekk",
  then building API sync endpoints = "direct", but setting up payment
  accounts for Trønderdekk = "none" (general onboarding, not API work).
  Match on WHAT is being done, not WHO it's for.
```

### 2. Fix the existing misclassification
**Migration:** Update the one incorrect row so the chart is immediately correct without waiting for a full reclassify.

```sql
UPDATE impact_classifications
SET focus_alignment = 'none', focus_item_id = NULL,
    reasoning = 'Setting up payment accounts is general onboarding, not EonTyre API integration work.'
WHERE activity_id = '56cad304-f84b-4300-9321-f342490106b2'
  OR (reasoning ILIKE '%dintero%' AND focus_alignment != 'none');
```

Wait — the Dintero activity_id from the query is the one with the `Setup 2x Trønderdekk Dintero accounts` title. Let me use the exact ID from the query results.

Actually, better approach: run a targeted reclassify rather than a one-off migration, since there could be other similar false positives. Instead, I'll just fix the prompt and the user can hit "Rebuild all classifications" to fix existing data.

### 3. Improve focus context formatting
**File:** `supabase/functions/ai-classify-contributions/index.ts`

Separate the focus item's core objective from its customer context in the prompt, so the AI can distinguish between "work ON the integration" vs "work FOR the same customer":

```
- [UUID] "EonTyre integration"
  Objective: Two-way API integration with EonTyre
  Context: For Trønderdekk to use Navio as core system
  Tags: Platform, SaaS, API-integration
  → Only classify as "direct" if the work IS API/integration/sync work, not just because it involves Trønderdekk
```

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/ai-classify-contributions/index.ts` | Add work-vs-customer distinction rule; improve focus context formatting |

## Result
- AI stops conflating "same customer" with "same focus area"
- User hits "Rebuild all classifications" to fix existing false positives
- Future classifications are more precise about what constitutes alignment

