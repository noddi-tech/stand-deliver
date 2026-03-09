

## Improve ClickUp Task Picker UX

### Current State
The "Import from ClickUp" button opens a dialog listing all tasks with checkboxes. No search/filter capability — users must scroll through everything to find the task they want.

### Changes

#### 1. Add search & filter to ClickUp dialog (`src/pages/MyStandup.tsx`)

Replace the current static list dialog with an improved picker:

- Add a **search input** at the top of the dialog that filters tasks by name in real-time (client-side, since tasks are already fetched)
- Add **status filter tabs/chips** (e.g., "All", "In Progress", "To Do") so users can narrow by status
- Show a **result count** (e.g., "3 of 12 tasks")
- Keep the checkbox multi-select + Import button pattern

#### 2. Better button label & inline placement

- Change button text from "Import from ClickUp" to **"Add from ClickUp"** — feels less like a bulk operation
- Add the ClickUp icon inline with the "What will you work on today?" input row, as a small icon button next to the Plus button, rather than a separate button below

#### 3. UX polish in the dialog

- Show **empty search state** ("No tasks matching 'xyz'") vs **empty data state** ("No tasks found")
- **Auto-focus** the search input when dialog opens
- Highlight search matches in task names (bold the matching substring)
- Show selected count in the Import button: "Add 2 tasks"
- Add a "Select all visible" checkbox in the header when filtered results are manageable

### Files Changed

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Rework ClickUp dialog: add search input, status filter chips, better empty states, move button inline with focus input row, rename to "Add from ClickUp" |

