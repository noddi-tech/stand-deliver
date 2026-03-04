

## Problem

After successful Slack OAuth, Supabase redirects to `https://standflow.naviosolutions.com#access_token=...`. The app loads at `/`, immediately navigates to `/dashboard`, which hits `ProtectedRoute`. There is a race condition: `getSession()` resolves with `null` (no existing session yet) and sets `loading=false` before the Supabase client has had time to process the access token from the URL hash fragment. This causes `ProtectedRoute` to redirect to `/auth`, losing the hash tokens.

## Fix

Modify `useAuth.tsx` to detect when the URL contains an OAuth hash fragment (`#access_token=`) and delay setting `loading=false` until `onAuthStateChange` fires with the session from the hash, rather than letting `getSession()` prematurely resolve with null.

### Changes

**`src/hooks/useAuth.tsx`**:
- Before calling `getSession()`, check if `window.location.hash` contains `access_token`
- If it does, skip the `getSession()` call for setting loading state, and rely solely on `onAuthStateChange` to resolve the session (which will fire once Supabase processes the hash tokens)
- If no hash fragment, proceed with `getSession()` as normal

This is a small, targeted change (about 5 lines) that fixes the race condition without restructuring the auth flow.

