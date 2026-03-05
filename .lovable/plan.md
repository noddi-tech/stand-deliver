

## Problem

The `slack-oauth-callback` edge function redirects to `SITE_URL` after completing the OAuth flow, but `SITE_URL` is not set as a Supabase secret, so it falls back to `http://localhost:5173`. This means after a successful Slack bot installation, the user gets redirected to localhost instead of the actual app URL.

The good news: the OAuth flow itself likely **succeeded** — the Slack installation was probably stored in the database. The only issue is the redirect destination.

## Fix

### 1. Set `SITE_URL` secret in Supabase
Add a new Supabase secret:
- **Name**: `SITE_URL`  
- **Value**: `https://standup-flow-app.lovable.app`

### 2. Update the edge function for resilience
Modify `slack-oauth-callback/index.ts` to use the published app URL as the hardcoded fallback instead of `localhost:5173`. This way even if the secret is missing, it redirects correctly.

Lines 20, 76, 80 — change fallback from `http://localhost:5173` to `https://standup-flow-app.lovable.app`.

### Files Changed

| File | Change |
|------|--------|
| Supabase secrets | Add `SITE_URL` = `https://standup-flow-app.lovable.app` |
| `supabase/functions/slack-oauth-callback/index.ts` | Update fallback URL on lines 20, 76, 80 |

