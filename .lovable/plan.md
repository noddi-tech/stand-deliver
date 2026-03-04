

# App Shell + Core Pages Implementation

## Overview
Create the app layout shell with collapsible sidebar, then build 3 new pages: My Standup, Team Feed, and Meeting Mode.

## 1. App Sidebar Layout (`src/components/AppLayout.tsx`)
- Uses `SidebarProvider`, `Sidebar` (collapsible="icon"), `SidebarTrigger`
- Slate-900 background, blue-500 active highlight via `NavLink`
- Links: Dashboard, My Standup, Team Feed, Meeting Mode, Analytics, Settings
- Icons from lucide: LayoutDashboard, PenSquare, Users, Presentation, BarChart3, Settings
- Top: org name fetched from `organization_members` + `organizations` join, user avatar from `profiles`
- Bottom: user name + sign out button
- Wraps `children` via `<Outlet />` pattern

## 2. App.tsx Routing Changes
- Import `AppLayout` and 3 new page components
- Nest all protected routes under a parent `<Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>` with child routes
- Add `/standup`, `/team`, `/meeting` routes
- Remove individual `ProtectedRoute` wrappers (handled by parent)

## 3. My Standup Page (`src/pages/MyStandup.tsx`)
The most complex page. Uses `useUserTeam()` hook to get `member_id` and `team_id`.

**Section 1: Resolve Previous Commitments**
- Query `commitments` where `member_id = current` and `status` IN (active, in_progress, blocked, carried)
- Render each as a card with title, priority badge, carry count indicator
- Action buttons: Done, In Progress, Blocked, Drop — each updates `commitments` table via mutation
- Progress bar: "X of Y resolved" (done + dropped count as resolved)

**Section 2: Today's Focus (locked until Section 1 complete)**
- "Complete" = all previous commitments have status done/dropped
- When locked: grayed out with lock icon and message
- When unlocked: text input + priority selector (high/medium/low) + Add button
- New commitments stored in local state, created on final submit

**Section 3: Blockers & Notes**
- Textarea for blockers_text
- Textarea for notes (optional)
- Integrate existing `BlockerDetector` component for AI detection

**Section 4: Mood Selector**
- 5 emoji buttons: 🚀 Great, 👍 Good, 😐 Okay, 😓 Struggling, 😰 Rough
- Selected state with blue ring

**Submit Button**
- Creates or gets today's `standup_session` (upsert by team_id + session_date)
- Inserts `standup_response` record
- Inserts new `commitment` records for Today's Focus items
- Updates resolved commitments' status
- Integrates `CommitmentParser` and `FocusRecommendations` AI components

## 4. Team Feed Page (`src/pages/TeamFeed.tsx`)
- Query `standup_responses` joined with `team_members` + `profiles`, filtered by team
- Group by `session_date` from the session
- Each response card: avatar, name, mood emoji, yesterday summary, today items, blockers
- Filters at top: member dropdown (from team_members), date range (Today/This Week/Custom)
- Show `ai_summary` from `standup_sessions` at top of each day group

## 5. Meeting Mode Page (`src/pages/MeetingMode.tsx`)
Full-screen dark mode page with multiple phases:

**Pre-meeting phase:**
- Grid of team members with avatars, shows who has submitted standup (green check / gray)
- "Start Meeting" button — randomizes speaker order

**Speaker turn phase:**
- Large speaker name + avatar
- Their yesterday items, today commitments, blockers displayed large
- Circular SVG countdown timer (120s default from `teams.timer_seconds_per_person`)
- Color transitions: emerald (>50%) → amber (25-50%) → red (<25%) → pulsing red (<10%)
- Next speakers queue sidebar
- Controls: Next Person, Pause/Resume, +30s, Skip
- Keyboard: Space = pause, ArrowRight = next

**Blockers board phase (after all speakers):**
- All blockers from the session displayed as cards
- Assignee selector dropdown

**Summary phase:**
- Completion stats: how many resolved, new commitments, blockers raised
- Session duration

## New Files
- `src/components/AppLayout.tsx` — sidebar layout
- `src/components/AppSidebar.tsx` — sidebar content
- `src/pages/MyStandup.tsx`
- `src/pages/TeamFeed.tsx`
- `src/pages/MeetingMode.tsx`

## Modified Files
- `src/App.tsx` — restructure routes with nested layout
- `src/pages/Dashboard.tsx` — remove sign-out button (now in sidebar)
- `src/pages/Settings.tsx` — remove outer min-h-screen (layout handles it)
- `src/pages/Analytics.tsx` — same

## Hooks
- `useUserTeam()` already exists in `useAnalytics.ts` — reuse throughout
- New queries inline using `useQuery` for commitments, responses, team members

## No Database Changes Needed
All tables and enums already exist. The schema supports everything required.

