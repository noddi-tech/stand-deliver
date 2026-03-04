

## Plan: Polish, Empty States, Command Palette, and Keyboard Shortcuts

### New Files

**`src/components/ui/EmptyState.tsx`**
Reusable component with props: `icon` (LucideIcon), `title`, `description`, `actionLabel?`, `actionHref?`. Centered layout with 48px icon in `text-muted-foreground/40`, title in `text-lg font-medium`, description in `text-sm text-muted-foreground`, optional `Button` wrapped in `Link`.

**`src/components/CommandPalette.tsx`**
Uses shadcn `CommandDialog` with `CommandInput`, `CommandList`, `CommandGroup`, `CommandItem`. Navigation items: Dashboard, My Standup, Team Feed, Meeting Mode, Analytics, Settings. Action items: "Start Today's Standup", "View Team Insights", "Open Weekly Digest". Each item has an icon + label, triggers `navigate()` on select and closes dialog.

**`src/components/KeyboardShortcuts.tsx`**
Modal overlay listing all shortcuts (N, D, M, ?) in a clean grid. Triggered by `?` key.

### Modified Files

**`src/components/AppLayout.tsx`**
- Add `CommandPalette` component (rendered inside `LayoutInner`)
- Add `KeyboardShortcuts` modal
- Add `useEffect` for global keyboard listener:
  - Skip if `activeElement` is input/textarea/contenteditable
  - `N` → `/standup`, `D` → `/dashboard`, `M` → `/meeting`
  - `?` → toggle shortcuts modal
  - `Cmd+K` / `Ctrl+K` → open command palette
- Render command palette + shortcuts modal

**`src/components/AppSidebar.tsx`**
- Add `⌘K` hint in sidebar footer (before sign out button): small `<kbd>` styled text showing "⌘K to search"

**`src/pages/Dashboard.tsx`**
- Replace the inline "Nothing needs attention" text with `<EmptyState>` using `CheckCircle2` icon
- Replace "No team members found" with `<EmptyState>` 
- When `!metrics` and not loading, show a full-page `<EmptyState>` with "No standups yet" message + button to `/standup`

**`src/pages/TeamFeed.tsx`**
- Replace the existing inline empty state (lines 158-164) with `<EmptyState icon={PenSquare} title="No standups submitted yet" description="Be the first to share your update!" actionLabel="Submit Your Standup" actionHref="/standup" />`

**`src/pages/MyStandup.tsx`**
- The empty state for resolved items (line 373-377) already exists — replace with `<EmptyState icon={CheckCircle2}` using green styling, compact variant

**`src/pages/Analytics.tsx`**
- When metrics data is empty/null and not loading, show `<EmptyState>` with "Need at least 1 week of standup data to show analytics"

**`src/pages/MeetingMode.tsx`**
- Blockers board empty state (line 408) — replace with `<EmptyState>` component

**`src/pages/Settings.tsx`**
- No changes needed (tabs already have content or placeholders)

### Toast coverage
Most toasts are already in place (standup submitted, Slack connected/error). Verify and ensure:
- Meeting mode `finishMeeting` shows toast — add `toast.success("Standup session completed! Summary posted.")` before navigate
- Commitment status changes in MyStandup already use toast (line 262-263) — confirmed

### Summary of all changes
- 3 new files: `EmptyState.tsx`, `CommandPalette.tsx`, `KeyboardShortcuts.tsx`
- 7 modified files: `AppLayout.tsx`, `AppSidebar.tsx`, `Dashboard.tsx`, `TeamFeed.tsx`, `MyStandup.tsx`, `Analytics.tsx`, `MeetingMode.tsx`

