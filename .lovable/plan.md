

## Onboarding Flow for New Users

### Overview
Create a multi-step onboarding wizard at `/onboarding` that guides new users through org creation, team setup, schedule configuration, member invites, and optional Slack connection. `ProtectedRoute` will detect missing org membership and redirect accordingly.

### Database Changes
No schema changes needed. Existing tables (`organizations`, `organization_members`, `teams`, `team_members`) already support all required operations. RLS policies already allow authenticated users to create orgs and org members to create teams/team members.

### Files to Create

**`src/pages/Onboarding.tsx`** — Multi-step wizard with 5 steps:

1. **Create Organization** — org name input, role dropdown (Engineering Lead, PM, Developer, Designer, Other — stored only for UX context, not persisted since org_role enum handles actual roles). Creates `organizations` record (with slugified name) + `organization_members` record (role: 'owner').

2. **Create First Team** — team name input, team size number input (2-20). Creates `teams` record (with org_id) + `team_members` record (role: 'lead', user_id: current user).

3. **Set Standup Schedule** — Day-of-week pill toggles (Mon-Sun, default Mon-Fri), time picker (default 09:00), timezone dropdown (auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone`), timer-per-person slider (60-300s, default 120). Updates the team record.

4. **Invite Team Members** — Email input with add/remove list. "Send Invites" stores emails (uses `supabase.auth.admin` is not available client-side, so for now just show a toast confirming invites will be sent). "Skip for now" link also advances.

5. **Connect Slack (Optional)** — Slack icon card with description, "Connect Slack" button (reuses same OAuth flow from IntegrationsTab), "Skip for now" link. Either action redirects to `/dashboard` with welcome toast.

Step indicator: horizontal progress bar with numbered step labels, current step highlighted blue.

Layout: clean full-page centered layout, no AppLayout/sidebar wrapper.

### Files to Modify

**`src/App.tsx`**:
- Import `Onboarding` page
- Add route: `<Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />`
  (inside ProtectedRoute but NOT inside AppLayout)

**`src/components/ProtectedRoute.tsx`**:
- After confirming user exists, query `organization_members` for current user
- Add loading state for org check
- If no org membership and current path is not `/onboarding` → redirect to `/onboarding`
- If org exists, check `team_members` for current user; if no team membership and not on `/onboarding` → redirect to `/onboarding`
- Pass onboarding state (hasOrg, hasTeam) via context or props so Onboarding page knows which step to start on

**`src/hooks/useAuth.tsx`** (or new hook `src/hooks/useOnboardingCheck.ts`):
- Create a dedicated hook `useOnboardingStatus` that queries org and team membership
- Returns `{ hasOrg, hasTeam, orgId, teamId, loading }`
- Used by both ProtectedRoute and Onboarding page

### Implementation Details

- Slug generation: lowercase, replace spaces with hyphens, strip non-alphanumeric
- Timezone list: use `Intl.supportedValuesOf('timeZone')` for full list
- Day toggles: array of `['mon','tue','wed','thu','fri','sat','sun']` matching the `standup_days` column format
- All Supabase mutations use the existing client; RLS policies already permit the required operations
- Step 4 invite emails: for MVP, just collect and show a toast — actual invite sending can be added later

