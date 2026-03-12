

## Summary

Two separate issues identified:

### 1. Dev login on prod -- by design
The "Continue as Joachim Rathke" button is intentionally hidden on `standup-flow-app.lovable.app` (line 7 of `isSandbox.ts` explicitly excludes it). This is correct -- sandbox login should not appear in production. It works fine on the preview URL (`*.lovable.app` minus prod).

No code change needed here.

### 2. GitHub sync failed -- CORS headers outdated

The `github-sync-activity` edge function has outdated CORS headers:
```
"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
```

The newer Supabase JS client sends additional headers (`x-supabase-client-platform`, etc.) that get blocked by the preflight check. This causes "Failed to send a request to the Edge Function."

**Fix**: Update the CORS headers in `supabase/functions/github-sync-activity/index.ts` (line 5) to include all required headers:
```
authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version
```

Should also check and fix the same CORS headers in `clickup-sync-activity` and any other edge functions that may have the old pattern.

### 3. After fix: re-sync

Once the CORS fix is deployed, go to **Settings → Integrations → Sync GitHub** to pull in activity for your new mapping (`Jokkos1337`). The sync will search for commits and PRs authored/merged by `Jokkos1337` across all `noddi-tech` repos for the last 30 days.

