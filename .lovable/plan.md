

## Problem

The Slack channel selector in Settings > Integrations is already coded in the UI, but it depends on a `slack-list-channels` edge function that was **never created**. The function is called at line ~109 of `IntegrationsTab.tsx` but there's no corresponding directory in `supabase/functions/`. Without it, the `channels` query returns nothing and the dropdown is hidden.

## Plan

### Create the `slack-list-channels` edge function

A simple edge function that:
1. Accepts `{ org_id }` in the request body
2. Looks up the `bot_token` from `slack_installations` for that org
3. Calls Slack's `conversations.list` API (filtering for public channels, excluding archived)
4. Returns `{ channels: [{ id, name }] }` — paginating through all results

### Register it in `supabase/config.toml`

Add `[functions.slack-list-channels]` with `verify_jwt = false`.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/slack-list-channels/index.ts` | **New** — edge function to list Slack channels |
| `supabase/config.toml` | Add function config entry |

No UI changes needed — the channel selector dropdown is already fully implemented and will appear once channels are returned.

