

## Plan: Fix Slack OAuth URL and Query Param Handling

### Changes to `src/components/settings/IntegrationsTab.tsx`

1. **Update OAuth URL construction** in `handleConnectSlack`:
   - Use `VITE_SUPABASE_URL` (already available via env) instead of constructing from project ID
   - Use `VITE_SLACK_CLIENT_ID` from env
   - Expand scopes to: `app_mentions:read,chat:write,chat:write.public,commands,im:write,im:read,im:history,users:read,users:read.email,channels:read,groups:read`

2. **Handle both `?slack=connected` and `?slack=error` query params** in useEffect:
   - On `connected`: show success toast with emoji, invalidate `slack-installation` query, clean URL params via `window.history.replaceState`
   - On `error`: show error toast, clean URL params

3. **Remove `SUPABASE_PROJECT_ID` const** (no longer needed for URL construction — use `VITE_SUPABASE_URL` directly)

### Changes to `.env`

Add `VITE_SLACK_CLIENT_ID` (public/publishable, safe to store client-side). Value will need to match the SLACK_CLIENT_ID secret already configured in Supabase.

### Summary of edits
- **`src/components/settings/IntegrationsTab.tsx`**: Update OAuth URL, add error handling, clean query params
- **`.env`**: Add `VITE_SLACK_CLIENT_ID`

