
Root cause (from current code + logs)
1) The 403 on `POST /rest/v1/organizations` with `"new row violates row-level security"` means the request is reaching PostgREST as `anon` (or without a valid authenticated JWT), so `auth.uid()` is null and the insert policy fails.
2) In `organizations`, current INSERT policy is now permissive and correct (`WITH CHECK auth.uid() IS NOT NULL`). So this is not a policy-shape issue anymore; it is an auth-state issue at request time.
3) The app can show onboarding/auth transitions incorrectly after deleting a user because `useAuth` trusts local session hydration (`getSession`) without server validation (`getUser`). A stale/invalid local auth state can exist briefly and lead to protected navigation + failing DB writes.
4) Secondary bug: in `Onboarding.handleCreateOrg`, Slack existing-org lookup ignores query errors (`existingOrg` read, `error` ignored), masking useful failure reasons.

What to build
A) Harden auth session validation so stale/deleted-user sessions are cleared before route decisions.
B) Block org creation if there is no verified authenticated user/session.
C) Improve onboarding error handling so auth/RLS failures are surfaced clearly instead of generic failure.
D) (Optional but recommended) strengthen Slack workspace extraction fallback from `identities[].identity_data` so prefill works consistently.

Implementation plan
1) `src/hooks/useAuth.tsx`
- Replace current startup flow with verified hydration:
  - Keep `onAuthStateChange` subscription.
  - On init: call `supabase.auth.getSession()`.
  - If session exists, immediately validate via `supabase.auth.getUser()`.
  - If validation fails or user missing, call local signout/clear session and set `session=null`.
  - Only then set `loading=false`.
- On auth state events, ensure invalid/expired states clear session deterministically.
- Outcome: user is never treated as authenticated from stale local state.

2) `src/components/ProtectedRoute.tsx`
- Keep current logic, but rely on hardened `useAuth` so redirect decisions are based on validated auth state.
- Ensure no onboarding/dashboard redirect occurs while auth validation is still loading.

3) `src/pages/Onboarding.tsx`
- In `handleCreateOrg`, before any DB call:
  - verify active auth (`getUser` or validated auth context).
  - if not authenticated: toast + redirect `/auth` + return.
- Capture and handle errors for Slack existing-org lookup (`const { data, error } = ...maybeSingle()`):
  - if error, show actionable toast (auth/policy issue) and abort.
- Keep insert flow, but when catching error:
  - map 42501 to explicit message: “Your session is not authenticated. Please sign in with Slack again.”
- (Optional) extend Slack metadata lookup:
  - fallback to `user.identities?.[0]?.identity_data` for workspace name/id.

4) Optional resilience improvement for Slack org lookup
- If you want guaranteed “find existing workspace org” without needing broad SELECT policy, implement a small `SECURITY DEFINER` RPC for safe lookup/join flow.
- This is optional for the current 403 root cause, but useful for multi-user same-workspace onboarding.

Validation plan (end-to-end)
1) Delete test user in Supabase Auth.
2) Open app:
  - should land on `/auth` and stay there until Slack sign-in.
  - should not jump to onboarding before successful auth.
3) Sign in with Slack.
4) Create organization:
  - POST to `/organizations` should be 201 (not 403).
5) Continue team creation + schedule save.
6) Reload app and confirm auth state stays consistent.

Technical notes
- No schema migration is required for the 403 fix itself.
- Existing RLS policy on `organizations` is valid; failure is caused by missing/invalid authenticated token at request time.
- Main fix is auth-state validation + guardrails in onboarding mutation path.
