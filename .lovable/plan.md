

## Fix: Auto-join existing org for Slack-invited users

### Problem
When a user is invited via Slack and signs in, they land on step 0 "Create your organization" and have to manually type an org name. The `create_org_and_join` RPC already handles matching by `slack_workspace_id`, but it's only called when the user clicks "Continue" — which requires them to fill in a name they don't know.

### Root cause
The onboarding page doesn't attempt auto-join on load. It waits for the user to type an org name and submit before `create_org_and_join` checks for an existing workspace.

### Fix
In `Onboarding.tsx`, add an auto-join attempt during initialization:

1. If the user has a `slackWorkspaceId` and `!onboardingStatus.hasOrg`, automatically call `create_org_and_join` with placeholder name/slug (these are ignored when an existing org is found by workspace ID)
2. If `is_existing: true` is returned, set the org state and skip directly to the team picker (step 1)
3. If no match found (new workspace), show step 0 normally
4. Show a loading state ("Looking for your workspace...") during the auto-join check

### Changes

| File | Change |
|------|--------|
| `src/pages/Onboarding.tsx` | Add auto-join logic in the `useEffect` initialization block: call `create_org_and_join` with `slackWorkspaceId`, skip to step 1 if existing org found, fetch available teams |

### Detail

In the existing `useEffect` (lines 81-93), after confirming user has no org but has a `slackWorkspaceId`:

```typescript
// Auto-join: try matching by Slack workspace ID
const { data: result } = await supabase.rpc("create_org_and_join", {
  p_name: "auto",  // ignored when existing match found
  p_slug: "auto",
  p_slack_workspace_id: slackWorkspaceId,
});
if (result?.is_existing) {
  // Skip step 0 entirely — go to team picker
  setOrgId(result.org_id);
  setIsExistingOrg(true);
  setExistingOrgName(result.org_name);
  // fetch teams...
  setStep(1);
}
```

This means invited users who share the same Slack workspace will never see "Create your organization" — they'll go straight to "Join a team".

