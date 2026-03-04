

# Enhancements to App Shell + Core Pages

The core structure (AppLayout, AppSidebar, MyStandup, TeamFeed, MeetingMode) already exists. This plan covers the gaps between what was built and the detailed spec.

## 1. AppSidebar Enhancements (`src/components/AppSidebar.tsx`)
- Add slate-900 background class explicitly
- Add hover state: `hover:bg-slate-800`
- Wrap user avatar in a DropdownMenu with "Settings" (navigates to /settings) and "Sign Out" items
- Add tooltip on each nav item when collapsed (using Tooltip from shadcn)
- Store sidebar collapsed state in localStorage via SidebarProvider's `defaultOpen` prop read from localStorage, and an `onOpenChange` callback that writes to localStorage

## 2. AppLayout Mobile Support (`src/components/AppLayout.tsx`)
- On mobile (<768px), use `collapsible="offcanvas"` behavior — the existing shadcn Sidebar already handles this via the SidebarProvider responsive mode
- Add a hamburger menu button in the header that's only visible on mobile
- Ensure SidebarTrigger is always visible

## 3. MyStandup Enhancements (`src/pages/MyStandup.tsx`)
- **Blocked action**: When clicking "Blocked", show an inline text input for `blocked_reason` before confirming
- **Drop action**: Show a confirmation dialog (AlertDialog) with optional reason input
- **Fade-out animation**: Add `transition-opacity duration-300` on resolved items
- **Age badge**: Show "Created X days ago" using `formatDistanceToNow`
- **Inline editing**: Make new commitment text editable after adding
- **Post-submit view**: After successful submit, replace form with a read-only summary card and "Edit" button that resets the form

## 4. TeamFeed Enhancements (`src/pages/TeamFeed.tsx`)
- Add role badge (lead/member) next to member name — fetch from `team_members.role`
- Parse `yesterday_text` and `today_text` into structured lists (split by newline) with icons
- Empty state with link to `/standup`
- Relative date headers: "Today", "Yesterday", or formatted date

## 5. MeetingMode Enhancements (`src/pages/MeetingMode.tsx`)
- **Hide sidebar**: Use a context/prop on AppLayout or call `useSidebar().setOpen(false)` on mount, restore on unmount
- **Dark background**: Apply `bg-slate-950 text-white` to the page container
- **Progress bar**: Add "Speaker X of Y" with a Progress component at the top
- **Session creation**: On "Start Meeting", create a `standup_session` with `session_type: 'physical'`
- **Complete standup**: On "Finish" in summary phase, update session `status: 'completed'` and `completed_at`

## Files Modified
- `src/components/AppSidebar.tsx` — dropdown, tooltips, dark bg, localStorage
- `src/components/AppLayout.tsx` — mobile hamburger, localStorage default
- `src/pages/MyStandup.tsx` — blocked input, drop dialog, animations, post-submit view
- `src/pages/TeamFeed.tsx` — role badges, structured lists, empty state, relative dates
- `src/pages/MeetingMode.tsx` — hide sidebar, dark mode, progress, session creation

## No Database Changes Needed
All required columns and enums already exist in the schema.

