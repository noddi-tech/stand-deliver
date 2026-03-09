

## Update GitHub Wizard Instructions

The current step 3 (line 244) combines repository and organization permissions into one confusing sentence. The user's screenshot confirms GitHub has two separate tabs: **Repositories** and **Organizations**, and users need to visit both.

### Change

**File**: `src/components/settings/GitHubSection.tsx` (line 244)

Replace the single step 3 with two distinct steps matching GitHub's actual UI:

```
3. Under the **Repositories** tab, click **+ Add permissions** and grant **Read-only** access to **Contents** and **Pull requests**
4. Switch to the **Organizations** tab, click **+ Add permissions** and grant **Read-only** access to **Members**
5. Copy the token and paste it below
```

This matches exactly what the user sees in GitHub's fine-grained token UI — two separate permission tabs that must both be configured.

