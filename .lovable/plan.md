

# Preserve Slack Deep-Link Destination Through Auth

## Problem

Clicking the "Start Standup" button in Slack opens `https://standflow.naviosolutions.com/standup`, but unauthenticated users get bounced to `/dashboard` after Slack OIDC sign-in. The original `/standup` destination is lost because three redirect points hardcode `/dashboard`:

1. `ProtectedRoute` redirects to `/auth` with no memory of the requested path.
2. `Auth.tsx` redirects to `/dashboard` after successful auth.
3. `AuthCallback.tsx` redirects to `/dashboard` after the OIDC round-trip.

The Slack reminder code itself (`slack-send-reminder`, `slack-followup-cron`) is already correct — it points at `/standup`. The bug is in the client-side auth flow.

## Solution

Use a `?next=` query parameter that survives the OIDC OAuth round-trip (Slack returns the user to a URL we control, but `location.state` is wiped by the full-page redirect, so query params are the only reliable carrier).

### Changes

**1. `src/components/ProtectedRoute.tsx`** — capture the original path

When redirecting unauthenticated users to `/auth`, append the original path + search:

```typescript
if (!user) {
  const next = `${location.pathname}${location.search}`;
  const safeNext = next && next !== "/auth" ? `?next=${encodeURIComponent(next)}` : "";
  return <Navigate to={`/auth${safeNext}`} replace />;
}
```

**2. `src/hooks/useAuth.tsx`** — forward `next` into the Slack OAuth redirect

In `signInWithSlack`, read `?next=` from the current URL and append it to the OAuth `redirectTo` so it survives the round-trip:

```typescript
const params = new URLSearchParams(window.location.search);
const next = params.get("next") || "";
const callbackUrl = `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
// pass callbackUrl as redirectTo
```

(I'll inspect the current `signInWithSlack` implementation to find the exact line, but the pattern is to thread `next` into whatever `redirectTo` it already builds.)

**3. `src/pages/AuthCallback.tsx`** — honour `?next=` after OIDC

Replace the hardcoded redirect:

```typescript
if (!loading && user) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return <Navigate to={safeNext} replace />;
}
```

The `startsWith("/") && !startsWith("//")` check prevents open-redirect attacks (no protocol-relative URLs).

**4. `src/pages/Auth.tsx`** — honour `?next=` for already-signed-in users

Replace `<Navigate to="/dashboard" replace />` (line 74) with the same safe-next pattern, so users who land on `/auth?next=/standup` while already signed in go straight to `/standup`.

### Files NOT changed

- `supabase/functions/slack-send-reminder/index.ts` and `slack-followup-cron/index.ts` already correctly emit `/standup` URLs — no change needed.
- `_shared/routes.ts` and the `SITE_URL` env var are correct.
- `Onboarding` redirect in `ProtectedRoute` stays — users without a team must complete onboarding before any deep-link destination.

## Verification Plan

After deployment:
1. Sign out, click a Slack reminder → confirm landing on `/standup` (not `/dashboard`).
2. Sign out, manually open `https://standflow.naviosolutions.com/standup` → confirm same.
3. Already-signed-in: click Slack link → confirm direct `/standup` load with no flash of `/dashboard`.
4. Confirm root `/` and `/auth` (no `next`) still default to `/dashboard`.

## Files Changed

| File | Change |
|------|--------|
| `src/components/ProtectedRoute.tsx` | Append `?next=<path>` when redirecting to `/auth` |
| `src/hooks/useAuth.tsx` | Forward `?next=` into Slack OIDC `redirectTo` |
| `src/pages/AuthCallback.tsx` | Read `?next=` and redirect there (with safety check) |
| `src/pages/Auth.tsx` | Read `?next=` for already-signed-in users |

