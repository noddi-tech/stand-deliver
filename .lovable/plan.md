

## Two Features: AI Standup Coach + ClickUp Integration

### Feature 1: AI Standup Coach (pre-submit review)

When you click "Submit Standup," instead of submitting immediately, the system sends your commitments to an AI edge function that reviews them and returns coaching suggestions. A review card appears with actionable tips before you confirm.

**How it works:**

1. User clicks "Submit Standup" → triggers AI review instead of immediate submit
2. New edge function `ai-coach-standup` receives the list of commitment titles
3. AI analyzes them for common anti-patterns:
   - Too broad/vague ("work on backend" → "implement user search API endpoint")
   - Too many items (recommend max 3-5)
   - Missing specificity (domains vs tasks)
   - Overlapping items that could be merged
4. Returns structured suggestions with original text + recommended rewrite
5. UI shows a coaching card between the form and submit button:
   - Each suggestion shows the original commitment, the issue, and a suggested rewrite
   - "Apply" button to accept a rewrite, "Dismiss" to ignore
   - "Submit anyway" to proceed without changes, "Apply all" for convenience
6. Suggestions are dismissable — the coach never blocks submission

**Edge function: `supabase/functions/ai-coach-standup/index.ts`**
- Uses Lovable AI Gateway with tool calling to extract structured suggestions
- Returns: `{ suggestions: [{ original, issue, rewrite, category }], overall_tip }`
- Categories: `too_broad`, `too_vague`, `consider_splitting`, `good` (positive reinforcement)

**UI: New `StandupCoachCard` component**
- Shown inline after clicking submit, before actual submission
- Collapsible card with AI sparkle icon and "AI Coach" badge
- Each suggestion is a small card with apply/dismiss actions

### Feature 2: ClickUp Integration

Pull tasks assigned to the user from ClickUp so they can select real tasks as commitments instead of typing free-text.

**How it works:**

1. **Settings > Integrations**: New ClickUp section where the team connects their ClickUp workspace via API key
2. **User-level mapping**: Each user links their ClickUp member ID (similar to Slack user mapping)
3. **MyStandup**: A "Pull from ClickUp" button in the Today's Focus section fetches the user's in-progress tasks and shows them as selectable items
4. Selected tasks become commitments with titles pulled from ClickUp

**Data model:**

```sql
-- Store ClickUp API credentials per org
ALTER TABLE public.organizations
  ADD COLUMN clickup_api_key_encrypted text;

-- Map StandFlow users to ClickUp members
CREATE TABLE public.clickup_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clickup_member_id text NOT NULL,
  clickup_display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
```

**Edge function: `supabase/functions/clickup-fetch-tasks/index.ts`**
- Fetches tasks assigned to the mapped ClickUp member with status "in progress" or "to do"
- Returns task name, status, list name, and ClickUp URL
- Uses ClickUp API v2: `GET /team/{team_id}/task?assignees[]={member_id}&statuses[]=in+progress`

**UI changes:**
- Settings > Integrations: ClickUp connection card (API key input + team ID)
- MyStandup > Today's Focus: "Import from ClickUp" button that opens a popover/dialog with selectable tasks

### Implementation order

Since these are independent, I recommend building them in two phases:

**Phase 1 — AI Standup Coach** (no external dependencies, uses existing Lovable AI)
| File | Change |
|------|--------|
| New `supabase/functions/ai-coach-standup/index.ts` | Edge function that reviews commitments via AI |
| New `src/components/ai/StandupCoachCard.tsx` | Pre-submit coaching UI with apply/dismiss actions |
| `src/pages/MyStandup.tsx` | Wire submit button to show coach review before confirming |
| `supabase/config.toml` | Register new edge function |

**Phase 2 — ClickUp Integration** (requires API key setup, new tables)
| File | Change |
|------|--------|
| New migration | `clickup_user_mappings` table + RLS |
| New `supabase/functions/clickup-fetch-tasks/index.ts` | Fetch assigned tasks from ClickUp API |
| New `src/components/settings/ClickUpSection.tsx` | Settings UI for API key + user mapping |
| `src/components/settings/IntegrationsTab.tsx` | Add ClickUp section |
| `src/pages/MyStandup.tsx` | "Import from ClickUp" button in Today's Focus |
| `supabase/config.toml` | Register new edge function |

The ClickUp integration will require the user to provide a ClickUp API key, which will be stored as a Supabase secret. The user will need to generate a personal API token from ClickUp Settings > Apps.

