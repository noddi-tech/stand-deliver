

## Problem

The **Team** and **Members** tabs in Settings are still placeholders. The Schedule tab was already built out. The user wants all settings tabs to be functional.

## Plan

### 1. Build out `TeamTab.tsx`

Display and allow editing of team and organization details:

- **Team name** (`teams.name`) — text input
- **Organization name** (`organizations.name`) — text input (read-only or editable if owner)
- **Slack channel** (`teams.slack_channel_id`) — display current linked channel

Loads via `team_members` → `teams` → `organizations` join. Save button updates the `teams` and/or `organizations` table.

### 2. Build out `MembersTab.tsx`

Show a table/list of all team members with:

- **Avatar + name** from `profiles` (joined via `team_members.user_id`)
- **Role** (`team_members.role` — lead/member) with ability for leads to change roles
- **Status** (`team_members.is_active`) — toggle active/inactive
- **Invite** — ability to invite new members (email-based or link-based, depending on scope)
- **Remove** — deactivate a member (set `is_active = false`)

Data comes from `team_members` joined with `profiles` for the current team.

### Files Changed

| File | Change |
|------|--------|
| `src/components/settings/TeamTab.tsx` | Fetch team + org data, render editable form for team name and org name, save updates |
| `src/components/settings/MembersTab.tsx` | Fetch team members with profiles, render member list with role management and active/inactive toggle |

No database changes needed — all columns already exist.

