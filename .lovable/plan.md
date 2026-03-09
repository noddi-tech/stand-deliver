

## GitHub Integration + Cross-Platform Weekly Digest

### Overview

Add GitHub as a third integration source. The weekly digest will aggregate activity from three platforms: StandFlow (standups, commitments), ClickUp (task completions), and GitHub (commits, PRs, reviews). This gives a comprehensive picture of what each team member accomplished.

### GitHub API Approach

GitHub supports personal access tokens (classic or fine-grained). The flow mirrors ClickUp:
1. User generates a GitHub Personal Access Token (PAT) with `repo` and `read:org` scopes
2. Token is validated via `GET https://api.github.com/user`
3. Stored in a `github_installations` table (org-level)
4. Team members are mapped to GitHub usernames

For fetching weekly activity:
- **Commits**: `GET /search/commits?q=author:{username}+committer-date:{weekStart}..{weekEnd}` (requires `Accept: application/vnd.github.cloak-preview+json`)
- **PRs**: `GET /search/issues?q=author:{username}+type:pr+created:{weekStart}..{weekEnd}`
- **Reviews**: `GET /search/issues?q=reviewed-by:{username}+type:pr+created:{weekStart}..{weekEnd}`

### Database Changes

**New table: `github_installations`** (org-level, same pattern as clickup/slack)

```sql
CREATE TABLE public.github_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_token_encrypted text NOT NULL,
  github_org_name text,
  installed_by uuid REFERENCES auth.users(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);
```

**New table: `github_user_mappings`** (user-level)

```sql
CREATE TABLE public.github_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_username text NOT NULL,
  github_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);
```

RLS: org members can view/insert; users can update/delete own mappings. Same pattern as ClickUp.

### Edge Functions

**`github-setup`** — Validates PAT, fetches user info and org members
- Input: `{ org_id, api_token }`
- Validates via `GET /user` with `Authorization: Bearer {token}`
- Stores token in `github_installations`
- Fetches org members via `GET /orgs/{org}/members` if org name provided
- Returns: `{ username, org_members: [{ login, name, avatar_url }] }`

**`github-fetch-activity`** — Fetches weekly activity for a user
- Input: `{ org_id, github_username, week_start, week_end }`
- Calls GitHub Search API for commits, PRs opened, PRs merged, and reviews
- Returns: `{ commits: number, prs_opened: number, prs_merged: number, reviews: number, top_repos: string[] }`

### Weekly Digest Enhancement

Update `ai-weekly-digest` to:
1. Look up `github_installations` for the org
2. For each team member with a `github_user_mappings` entry, call `github-fetch-activity`
3. Also look up `clickup_installations` + fetch completed ClickUp tasks for the week
4. Include all cross-platform data in the AI prompt context:

```text
GitHub Activity:
- 47 commits across 5 repos (frontend, api, docs, infra, mobile)
- 12 PRs opened, 9 merged
- 8 code reviews completed

ClickUp Activity:
- 15 tasks completed
- 3 tasks moved to "in progress"

StandFlow Activity:
- 20 commitments made, 16 completed (80%)
- 2 blockers resolved, 1 unresolved
```

5. Store cross-platform summary in a new `cross_platform_activity` JSONB column on `ai_weekly_digests`

### UI Changes

**`src/components/settings/GitHubSection.tsx`** — Setup wizard (same 3-step pattern as ClickUp):
1. Enter GitHub PAT (instructions on where to generate it)
2. Optionally enter GitHub org name to auto-list members
3. Map team members to GitHub usernames (auto-match by name/email where possible)

**`IntegrationsTab.tsx`** — Add `<GitHubSection />` after ClickUp section.

**`WeeklyDigest.tsx`** — Add a "Cross-Platform Activity" card showing GitHub + ClickUp + StandFlow breakdown with commit counts, PR stats, and task completions.

### Files Changed

| File | Change |
|------|--------|
| New migration | `github_installations` + `github_user_mappings` tables with RLS; add `cross_platform_activity` JSONB column to `ai_weekly_digests` |
| New `supabase/functions/github-setup/index.ts` | Validate PAT, store installation, list org members |
| New `supabase/functions/github-fetch-activity/index.ts` | Fetch commits, PRs, reviews for a user |
| New `src/components/settings/GitHubSection.tsx` | 3-step setup wizard |
| `src/components/settings/IntegrationsTab.tsx` | Add GitHub section |
| `supabase/functions/ai-weekly-digest/index.ts` | Fetch GitHub + ClickUp activity, include in AI context |
| `src/pages/WeeklyDigest.tsx` | Add cross-platform activity card |
| `supabase/config.toml` | Register new edge functions |

### No New Secrets Required

Like ClickUp, the GitHub PAT is entered per-org through the wizard and stored in the database.

