

## Problem

The GitHub org members dropdown is empty because the `/orgs/{org}/members` API endpoint requires the token to have **`read:org`** scope (classic tokens) or **Organization Members: Read** permission (fine-grained tokens). The setup wizard instructions only mention "Contents and Pull requests" — it never tells users to grant org member read access.

Additionally, the `fetchOrgMembers` function silently returns `[]` on failure (`if (!res.ok) return []`), so there's no feedback when the token lacks permissions.

## Fix

### 1. Update the wizard instructions to include org member permissions

In `GitHubSection.tsx`, update step 3 of the PAT instructions:
- **Fine-grained tokens**: Add "**Organization → Members: Read**" to the required permissions list
- **Classic tokens**: Mention `read:org` scope

### 2. Better error feedback when member fetch fails

In `github-setup/index.ts`, update `fetchOrgMembers` to return error info instead of silently returning `[]`:
- If the response is 403/404, return a structured response indicating the token lacks org permissions
- Pass this back to the UI so it can show a warning: "Could not fetch org members — your token may need Organization Members: Read permission"

### 3. Show warning in the UI when no members are fetched

In `GitHubSection.tsx`, when `githubMembers` is empty despite having a `github_org_name`, show an alert/warning suggesting the user regenerate their token with the correct permissions, with a link to GitHub token settings.

### Changes

| File | Change |
|------|--------|
| `src/components/settings/GitHubSection.tsx` | Update PAT instructions to include org member permissions. Add warning when connected to an org but no members fetched. |
| `supabase/functions/github-setup/index.ts` | Return error details from `fetchOrgMembers` instead of silent empty array. |

