

## Root Cause

When Supabase completes OAuth, it redirects to `https://standflow.naviosolutions.com#access_token=...`. The app loads at `/`, and React Router immediately executes `<Navigate to="/dashboard" replace />` — this **strips the hash fragment** from the URL before the Supabase client can read and process the tokens. The tokens are lost, so no session is established, and `ProtectedRoute` bounces the user back to `/auth`.

## Fix

Two changes:

### 1. `src/hooks/useAuth.tsx` — redirect to `/auth/callback`
Change `signInWithSlack` to redirect to a dedicated callback path:
```
redirectTo: `${window.location.origin}/auth/callback`
```
This avoids the root route's `<Navigate to="/dashboard">` which destroys the hash.

### 2. `src/App.tsx` — add `/auth/callback` route
Add a new route that simply shows a spinner while the auth state resolves:
```
<Route path="/auth/callback" element={<AuthCallback />} />
```

### 3. `src/pages/AuthCallback.tsx` — new file
A small component that:
- Shows a loading spinner
- Waits for `useAuth()` to finish loading
- If `user` exists → navigate to `/dashboard`
- If no user after auth resolves → navigate to `/auth` with an error toast
- Safety timeout of 5 seconds to avoid hanging forever

### 4. Supabase Dashboard — add redirect URL
Add `https://standflow.naviosolutions.com/auth/callback` to the Redirect URLs allowlist in Authentication → URL Configuration.

## Why the CORS error is irrelevant
The `track/` CORS error is Slack's own telemetry request failing — it has no effect on the OAuth flow or session establishment.

