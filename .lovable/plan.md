

## Bug Fix Plan: ClickUp Activity Not Showing + Dashboard Empty

### Root Cause Analysis

I manually invoked `clickup-sync-activity` and it **worked** — it found the "AI chatbot v1" task (completed by Joachim) and inserted it into `external_activity`. The function was running on a cron every 30 minutes but with **stale deployed code** (pre-fix version). The data now exists.

**Three issues to fix:**

### 1. Redeploy `clickup-sync-activity` edge function
The cron job is running but calling the old deployed version of the function. Need to redeploy so the broadened status filter (from the last fix) takes effect going forward.

### 2. Standup responses query — defensive fix
The current query uses `.eq("member.team_id", teamId!)` nested filter which should work with PostgREST but can be fragile. Change to a two-step approach: first get session IDs for the team, then query responses by those session IDs. This is more reliable and aligns with the RLS policy (which checks via `standup_sessions`).

**`src/hooks/useRecentActivity.ts`** — replace the standup query:
```typescript
// Step 1: get session IDs for this team in the last 7 days
const { data: sessions } = await supabase
  .from("standup_sessions")
  .select("id")
  .eq("team_id", teamId!)
  .gte("session_date", sevenDaysAgo.split("T")[0]);

const sessionIds = (sessions || []).map(s => s.id);

// Step 2: query responses by session IDs
if (sessionIds.length > 0) {
  respRes = await supabase
    .from("standup_responses")
    .select("id, member_id, submitted_at, mood, member:team_members!inner(id, profile:profiles!inner(full_name, avatar_url))")
    .in("session_id", sessionIds)
    .order("submitted_at", { ascending: false })
    .limit(20);
}
```

### 3. Deploy all sync edge functions
Redeploy `clickup-sync-activity`, `github-sync-activity`, and `github-fetch-activity` to ensure the latest fixes (skip `__none__`, broadened ClickUp statuses) are live.

### Files Changed

| File | Change |
|------|--------|
| `src/hooks/useRecentActivity.ts` | Use two-step session-based query for standup responses |
| Edge function deploys | `clickup-sync-activity`, `github-sync-activity`, `github-fetch-activity` |

