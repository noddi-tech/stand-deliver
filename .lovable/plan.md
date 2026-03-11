

## Two Problems

### 1. React Hooks Violation (Causing the Error)
The `AuthProvider` component has an early `return` on line 35 **before** the `useState` and `useEffect` hooks on lines 51-90. React requires hooks to be called unconditionally on every render. This causes the "useAuth must be used within AuthProvider" error because React fails during mount.

### 2. Mock User Can't Query Real Data
The mock user has a fake UUID (`00000000-...`) and a fake JWT (`dev-token`). Every Supabase query using this session fails silently because:
- RLS policies reject the fake user ID
- The Supabase client sends an invalid JWT

This is why the dashboard shows "0%" everywhere and "No recent activity" -- all queries return empty.

---

## Fix

### Replace mock user with real Supabase sign-in via edge function

Instead of a fake mock, create a **dev-only impersonation flow**:

1. **New edge function `dev-impersonate`**: Uses the admin API (`supabase.auth.admin.generateLink`) to create a magic link for a given user email. Returns the OTP token. Only works when a `DEV_MODE_SECRET` matches.

2. **Fix `AuthProvider`**: Remove the early return. Move all hooks to run unconditionally. In dev mode, show a user picker overlay if no session exists (instead of redirecting to `/auth`).

3. **Dev user picker component**: A simple dropdown that lists profiles from the database. When a user is selected, calls the edge function to get a token, then calls `supabase.auth.verifyOtp()` to create a real session. Once signed in, the real Supabase session works with all RLS policies.

4. **Remove dev bypasses from `useOnboardingStatus`**: Since we'll have a real session, the onboarding check works normally.

### Files

| File | Change |
|------|--------|
| `supabase/functions/dev-impersonate/index.ts` | New edge function -- generates magic link token for a given email using admin API. Protected by a shared secret. |
| `src/hooks/useAuth.tsx` | Remove early return, fix hooks order. In dev mode with no session, render a dev user picker instead of redirecting to auth. |
| `src/components/DevUserPicker.tsx` | New component -- fetches profiles, lets you pick a user, calls the edge function, signs in with the OTP. |
| `src/hooks/useOnboardingStatus.ts` | Remove dev bypass (real session handles it). |
| `src/pages/Auth.tsx` | Remove dev bypass redirect. |

### Flow
1. Sandbox loads -> AuthProvider renders -> no session -> DevUserPicker overlay appears
2. User picks "Joachim" from the list -> calls `dev-impersonate` edge function with Joachim's email
3. Edge function returns OTP token -> client calls `verifyOtp` -> real Supabase session created
4. All queries work with real RLS, real org/team membership, real data

