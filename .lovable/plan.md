

## Fix GitHub User Mapping UX

### Problems

1. **GitHub org members not shown in dropdown**: The screenshot shows all users have a plain text input ("GitHub username") instead of a Select dropdown with the fetched GitHub org members. This means `githubMembers` is empty despite being connected to `noddi-tech`. The `list-members` call in `useEffect` fires but its results may not populate correctly, or the org members fetch is failing silently.

2. **No "Doesn't have a GitHub account" option**: Team members like Tom Arne Danielsen who don't use GitHub can't be marked as such — they just sit as "Unlinked" forever with no way to dismiss them.

### Fix 1: Show GitHub org members in the Select dropdown

The `useEffect` that calls `github-setup` with `action: "list-members"` looks correct, but the Select dropdown only shows when `githubMembers.length > 0`. Two issues:
- Add a "No GitHub account" option to the Select (value `__none__`)
- Also filter out already-mapped GitHub usernames from the dropdown so you can't double-assign
- Add a "Change" button next to already-linked mappings so users can re-map

### Fix 2: "No GitHub account" state

Add a special mapping value (e.g., `github_username = '__none__'`) or a dedicated `has_no_github` boolean. Simpler approach: store `github_username = '__none__'` in the mapping table, and display it as "No GitHub account" with a muted style and option to change later.

### Changes

| File | Change |
|------|--------|
| `src/components/settings/GitHubSection.tsx` | Add "No GitHub account" option to Select dropdown. Filter already-mapped users from dropdown. Add "Change" button on linked mappings. Handle `__none__` display. For the text input fallback (no org members), also add a "No GitHub account" button. |

### Detail

In the Select dropdown (line 311-333):
- Add `<SelectItem value="__none__">No GitHub account</SelectItem>` at the top
- Filter `githubMembers` to exclude usernames already mapped to other team members
- When `__none__` is selected, save mapping with `github_username: "__none__"`

For already-linked mappings (line 298-309):
- If `github_username === "__none__"`, show "No GitHub account" in muted text
- Add a small "Change" button that clears the mapping (deletes from DB) so user can re-select

For the text input fallback (line 334-350):
- Add a "No account" button next to the input

