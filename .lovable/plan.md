

# Fix: `/settings/standup` Redirect Lands on Dashboard

## Problem
The redirect `<Route path="/settings/standup" element={<Navigate to="/standup" replace />} />` is on line 46, **outside** the `<ProtectedRoute>` wrapper. When an unauthenticated user clicks the Slack link:

1. Route matches line 46 → redirects to `/standup`
2. `/standup` is inside the protected layout → `ProtectedRoute` checks auth
3. User isn't authenticated yet → redirects to `/auth`
4. After auth, `AuthCallback` redirects to `/dashboard` (not back to `/standup`)

The redirect chain loses the original destination.

## Fix
Move the `/settings/standup` redirect **inside** the protected layout route, so it's a sibling of `/standup`. This way auth happens first (via the parent layout's `ProtectedRoute`), then the redirect fires after the user is already authenticated.

### `src/App.tsx`
- **Remove** line 46 (`/settings/standup` redirect outside layout)
- **Add** inside the layout route block (after line 67):
  ```tsx
  <Route path="/settings/standup" element={<Navigate to="/standup" replace />} />
  ```

One line moved. The `/my-standup` redirect on line 45 should also move inside for the same reason.

| File | Change |
|------|--------|
| `src/App.tsx` | Move `/settings/standup` and `/my-standup` redirects inside the protected layout route |

