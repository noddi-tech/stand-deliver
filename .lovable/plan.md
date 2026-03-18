

# Show All Members by Default in Member Breakdown

Remove the 6-member cap so all members display by default. The "Show all / Show less" toggle becomes unnecessary unless the team is very large.

### Change

**`src/components/team/MemberBreakdown.tsx`**
- Change `useState(false)` to `useState(true)` for `showAll`, so all members render by default.
- Alternatively, simply remove the slicing logic and always show all members (cleaner).

This is a 1-line change.

