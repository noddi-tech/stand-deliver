

## Phase 2: ClickUp Integration

### Overview

A 3-step setup wizard in Settings > Integrations guides the user through connecting ClickUp. Once connected, MyStandup gets an "Import from ClickUp" button that pulls assigned in-progress tasks as commitments.

### ClickUp API approach

ClickUp supports personal API tokens (`pk_...`) for authentication. The flow:
1. **Get teams (workspaces)**: `GET https://api.clickup.com/api/v2/team` — returns workspace IDs
2. **Get authorized user**: `GET https://api.clickup.com/api/v2/user` — returns the authenticated user's member ID
3. **Get filtered tasks**: `GET https://api.clickup.com/api/v2/team/{team_id}/task?assignees[]={member_id}&statuses[]=in+progress&statuses[]=to+do` — returns tasks assigned to the user

Authentication: `Authorization: {personal_token}` header (no Bearer prefix for personal tokens).

### What the user needs to do in ClickUp

The wizard will explain these steps inline:
1. Open ClickUp > click avatar (top-right) > **Settings**
2. Go to **Apps** in the left sidebar
3. Click **Generate** under "API Token"
4. Copy the token (starts with `pk_`)
5. Paste it into the wizard

### Database changes

**New table: `clickup_installations`** (org-level, similar to `slack_installations`)

```sql
CREATE TABLE public.clickup_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  api_token_encrypted text NOT NULL,
  clickup_team_id text NOT NULL,
  clickup_team_name text,
  installed_by uuid REFERENCES auth.users(id),
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- RLS: org members can view/insert/update
```

**New table: `clickup_user_mappings`** (user-level)

```sql
CREATE TABLE public.clickup_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clickup_member_id text NOT NULL,
  clickup_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- RLS: org members can view, users can insert/update own
```

### Edge functions

**`clickup-fetch-tasks`** — Fetches tasks assigned to a user
- Input: `{ org_id, user_id }` 
- Looks up `clickup_installations` for the API token, `clickup_user_mappings` for the member ID
- Calls ClickUp API: `GET /team/{team_id}/task?assignees[]={member_id}&statuses[]=in progress&statuses[]=to do&subtasks=true`
- Returns: `{ tasks: [{ id, name, status, list_name, url, priority }] }`

**`clickup-setup`** — Validates token, fetches workspace info and team members
- Input: `{ org_id, api_token }` (step 1) or `{ org_id, action: "list-members" }` (step 2)
- Step 1: Validates token via `GET /team`, stores installation, returns workspace name + members list
- Step 2: Returns workspace members for user mapping

### UI components

**`src/components/settings/ClickUpSection.tsx`** — Setup wizard with 3 steps:

1. **Enter API Token** — Instructions on where to find it in ClickUp, input field, "Connect" button. On submit, calls `clickup-setup` to validate and store.
2. **Select Workspace** — If multiple workspaces, pick one (most users have one, auto-selected).
3. **Map Users** — Table showing team members with dropdown to link each to a ClickUp member (same pattern as Slack user mapping). Auto-link by matching email.

Once connected, shows confirmed state (workspace name + green badge) with "Disconnect" option.

**`IntegrationsTab.tsx`** — Add `<ClickUpSection />` after the Slack section.

**`MyStandup.tsx`** — "Import from ClickUp" button in the Today's Focus section:
- Opens a dialog/popover listing assigned tasks from ClickUp
- Each task has a checkbox; selected tasks are added as commitments
- Shows task name, status, list name, and priority

### Security

- API token stored encrypted in `clickup_installations` (accessed only via edge functions with service role)
- RLS prevents cross-org access
- Edge functions validate org membership before returning data

### Files changed

| File | Change |
|------|--------|
| New migration | `clickup_installations` + `clickup_user_mappings` tables with RLS |
| New `supabase/functions/clickup-setup/index.ts` | Validate token, store installation, list members |
| New `supabase/functions/clickup-fetch-tasks/index.ts` | Fetch assigned tasks for a user |
| New `src/components/settings/ClickUpSection.tsx` | 3-step setup wizard |
| `src/components/settings/IntegrationsTab.tsx` | Add ClickUp section |
| `src/pages/MyStandup.tsx` | "Import from ClickUp" button + task picker dialog |
| `supabase/config.toml` | Register new edge functions |

### Secret needed

The ClickUp API token is entered per-org through the wizard and stored in the database (not as a Supabase secret), since each org has their own token. No new Supabase secrets required.

