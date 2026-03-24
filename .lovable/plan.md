
# Surgical Plan: Fix live Slack links resolving to `/settings/standup`

## What I found (from code inspection)
- The “Start Standup” button is generated in exactly two places:
  - `supabase/functions/slack-send-reminder/index.ts`
  - `supabase/functions/slack-followup-cron/index.ts`
- Both build URL as:
  - ```${getSiteUrl()}${ROUTES.standup}```
- `ROUTES.standup` is correct (`/standup`), so `/settings/standup` can only happen if `SITE_URL` includes a path like `/settings`.
- There are no hardcoded `/settings/standup` strings in the repo.

## Likely root cause
`SITE_URL` is currently set (or was recently set) with a path segment (e.g. `https://standflow.naviosolutions.com/settings`) instead of just origin.  
That makes Slack buttons become `https://standflow.naviosolutions.com/settings/standup` in new messages too.

## Implementation plan

1. **Harden URL generation at source**
   - File: `supabase/functions/_shared/routes.ts`
   - Update `getSiteUrl()` to normalize to URL origin only (strip pathname/query/hash), with safe fallback to `https://standflow.naviosolutions.com`.
   - Add a small helper (e.g. `buildAppUrl(route)`) so route joining is always normalized and slash-safe.

2. **Use normalized builder everywhere Slack sends links**
   - Files:
     - `supabase/functions/slack-send-reminder/index.ts`
     - `supabase/functions/slack-followup-cron/index.ts`
     - `supabase/functions/slack-send-invite/index.ts` (consistency)
     - `supabase/functions/slack-oauth-callback/index.ts` (consistency for redirects)
   - Replace string concatenation with shared helper to prevent future divergence.

3. **Add immediate safety redirect for already-bad links**
   - File: `src/App.tsx`
   - Add route redirect:
     - `/settings/standup` → `/standup`
   - This removes 404 even if any bad link still exists in already-sent Slack messages.

4. **Add minimal observability**
   - In reminder/follow-up functions, log computed standup URL once per invocation (domain/path only, no secrets) so we can quickly verify what Slack is receiving.

5. **Verification pass**
   - Confirm no `my-standup` or `/settings/standup` link builders remain.
   - Trigger one reminder and one follow-up and verify generated button URL is exactly:
     - `https://standflow.naviosolutions.com/standup`
   - Confirm clicking legacy `/settings/standup` now lands on `/standup` (no 404).

## Technical details
- This fix makes the system resilient even if `SITE_URL` is misconfigured with a path later.
- It also keeps all Slack URL creation centralized in one helper, so route changes don’t drift across functions.
- Redirect route is a backward-compatibility guardrail; normalized URL builder is the true root-cause fix.

## Files to change
- `supabase/functions/_shared/routes.ts`
- `supabase/functions/slack-send-reminder/index.ts`
- `supabase/functions/slack-followup-cron/index.ts`
- `supabase/functions/slack-send-invite/index.ts`
- `supabase/functions/slack-oauth-callback/index.ts`
- `src/App.tsx`
