

# Fix: `/standup` Slack Link Bouncing Through `/onboarding` → `/dashboard`

## Root cause

There are **two bugs** stacked on top of each other:

### Bug 1 — Race in `useOnboardingStatus` (the real culprit)

`useOnboardingStatus` initialises with `loading: true`. On first render, `user` is `null` (auth still resolving). The effect runs anyway, hits the `if (!user)` branch, and sets `loading: false, hasOrg: false, hasTeam: false`. When auth then resolves and `user` becomes set, the effect re-fires — **but the hook does NOT reset `loading` back to `true` before the new query runs.**

That leaves a window where `ProtectedRoute` sees:

```
user = <signed-in user>
onboarding.loading = false
onboarding.hasOrg = false   ← stale from the user=null pass
```

…and redirects to `/onboarding`. Onboarding's own copy of the hook then resolves correctly (`hasOrg: true, hasTeam: true`) and runs its hardcoded `navigate("/dashboard")` (line 84) — which also drops the `?next=` parameter.

This is why the URL bar shows `/standup → /onboarding → /dashboard` and the original destination is lost even when the user is already authenticated.

### Bug 2 — `Onboarding.tsx` ignores `?next=`

Even if Bug 1 didn't exist, three `navigate("/dashboard")` calls in `Onboarding.tsx` (lines 84, 201, 271) hardcode the destination and would still strip `?next=` if the user ever legitimately landed on onboarding mid-flow.

## Fix

### 1. `src/hooks/useOnboardingStatus.ts` — eliminate the stale-data window

Reset `loading: true` at the start of the effect whenever `user` changes, so consumers never see a stale `loading: false, hasOrg: false` snapshot from a previous run.

```ts
useEffect(() => {
  if (!user) {
    setStatus({ hasOrg: false, hasTeam: false, orgId: null, teamId: null, loading: false });
    return;
  }

  // Reset to loading whenever we re-check (prevents stale hasOrg=false flash)
  setStatus((prev) => ({ ...prev, loading: true }));

  async function check() { /* …existing query… */ }
  check();
}, [user]);
```

This single change kills the `/onboarding` flash. `ProtectedRoute` will keep showing its spinner until the real org/team check completes.

### 2. `src/pages/Onboarding.tsx` — preserve `?next=` on every redirect

Add a small helper at the top of the component:

```ts
const safeNext = (() => {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
})();
```

Replace **all three** hardcoded redirects with `navigate(safeNext, { replace: true })`:

| Line | Current | Replace with |
|------|---------|--------------|
| 84 | `navigate("/dashboard", { replace: true })` | `navigate(safeNext, { replace: true })` |
| 201 | `navigate("/dashboard", { replace: true })` | `navigate(safeNext, { replace: true })` |
| 271 | `navigate("/dashboard", { replace: true })` | `navigate(safeNext, { replace: true })` |

This ensures that if a user *does* legitimately complete onboarding via a deep link (e.g. invited to a team via a Slack reminder), they still land on the page they originally requested.

### 3. `src/components/ProtectedRoute.tsx` — propagate `?next=` into the onboarding redirect

When ProtectedRoute bounces an unfinished user to `/onboarding`, forward the original destination so step #2 above can use it:

```ts
if ((!onboarding.hasOrg || !onboarding.hasTeam) && !isOnboarding) {
  const next = `${location.pathname}${location.search}`;
  const safeNext = next && next !== "/onboarding" ? `?next=${encodeURIComponent(next)}` : "";
  return <Navigate to={`/onboarding${safeNext}`} replace />;
}
```

## Files NOT changed

- `useAuth.tsx`, `Auth.tsx`, `AuthCallback.tsx` — already correctly thread `?next=` through the OIDC round-trip.
- Slack edge functions — already emit correct `/standup` URLs.

## Verification

1. **Already signed in**, click Slack `/standup` link → loads `/standup` with no flash through `/onboarding` or `/dashboard`.
2. **Signed out**, click Slack `/standup` link → goes to `/auth?next=/standup` → after Slack OIDC → lands on `/standup`.
3. **New user**, click Slack `/standup` link → completes onboarding → lands on `/standup` (not `/dashboard`).
4. Plain `/dashboard` visits and root `/` redirects still work normally.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useOnboardingStatus.ts` | Reset `loading: true` at start of each re-check to kill stale-data flash |
| `src/components/ProtectedRoute.tsx` | Forward `?next=` when redirecting to `/onboarding` |
| `src/pages/Onboarding.tsx` | Replace 3 hardcoded `/dashboard` navigates with `safeNext` honouring `?next=` |

