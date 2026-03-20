

# Fix Hardcoded Slack URLs — Route Divergence Bug

## Problem
The Slack "Start Standup" button links to `https://standup-flow-app.lovable.app/my-standup`, but the route is `/standup`. Additionally, the production domain is `standflow.naviosolutions.com`. The URL is hardcoded instead of using the `SITE_URL` env var.

CTO's point: hardcoded strings instead of a shared constant → divergence when routes change.

## Changes

### 1. Fix `slack-send-reminder` URL (line 106)
**File:** `supabase/functions/slack-send-reminder/index.ts`

- Replace hardcoded `"https://standup-flow-app.lovable.app/my-standup"` with:
  ```ts
  const siteUrl = Deno.env.get("SITE_URL") || "https://standup-flow-app.lovable.app";
  // ...
  url: `${siteUrl}/standup`
  ```

### 2. Audit all other hardcoded URLs
Three other files also hardcode the lovable.app domain. Consolidate them all to use `SITE_URL`:
- `slack-send-invite/index.ts` — already uses `SITE_URL` with fallback ✅
- `slack-oauth-callback/index.ts` — already uses `SITE_URL` with fallback ✅  
- `dev-impersonate/index.ts` — blocked origins list, keep as-is (security config)

Only `slack-send-reminder` needs fixing.

### 3. Create shared route constants (optional but recommended)
Add a `supabase/functions/_shared/routes.ts` with:
```ts
export const ROUTES = { standup: "/standup", dashboard: "/dashboard" };
export function getSiteUrl() { return Deno.env.get("SITE_URL") || "https://standup-flow-app.lovable.app"; }
```
Import in `slack-send-reminder` and `slack-send-invite` to prevent future divergence.

### 4. Deploy
Redeploy `slack-send-reminder` edge function.

## Files to change
| File | Change |
|------|--------|
| `supabase/functions/_shared/routes.ts` | New: shared `getSiteUrl()` + route constants |
| `supabase/functions/slack-send-reminder/index.ts` | Use `getSiteUrl()` + `/standup` |
| `supabase/functions/slack-send-invite/index.ts` | Use `getSiteUrl()` (minor cleanup) |
| `supabase/functions/slack-oauth-callback/index.ts` | Use `getSiteUrl()` (minor cleanup) |

