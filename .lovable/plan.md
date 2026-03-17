

# Last-Synced Timestamp + Backfill Fix + Verification

## 1. Fix Backfill Function (timeout issue)

The backfill function times out because it makes 1 RPC call per row (1206 sequential HTTP round-trips). Replace with batch `.upsert()`.

**`supabase/functions/backfill-activity-badges/index.ts`**:
- Increase BATCH from 100 → 500
- Replace the serial `for (const row of toProcess) { await sb.rpc(...) }` loop with:
  1. Map all `toProcess` rows through `resolveActivityBadge()` to build an array of badge objects
  2. Single `sb.from("activity_badges").upsert(badgeRows, { onConflict: "activity_id,source_type" })` call per batch
- This reduces ~1206 sequential RPCs to ~3 batch upserts

## 2. Add Last-Synced Timestamp to Activity Page

**`src/pages/Activity.tsx`**:
- Add a new query to fetch the most recent `created_at` from `activity_badges` for the team:
  ```ts
  const { data: lastSync } = useQuery({
    queryKey: ["badge-last-sync", teamId],
    enabled: !!teamId,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_badges")
        .select("updated_at")
        .eq("team_id", teamId!)
        .order("updated_at", { ascending: false })
        .limit(1);
      return data?.[0]?.updated_at || null;
    },
  });
  ```
- Render below the page subtitle (~line 219): a small muted text showing `"Badges last synced X ago"` using `formatDistanceToNow` if `lastSync` exists

## 3. Invoke Backfill After Deploy

After the backfill function is redeployed with the batch fix, invoke it to process the remaining 1206 unbadged rows. Then verify via SQL query that `activity_badges` count matches `external_activity` count.

## Files Summary

| File | Change |
|---|---|
| `supabase/functions/backfill-activity-badges/index.ts` | Replace serial RPC with batch upsert |
| `src/pages/Activity.tsx` | Add last-synced timestamp query + display |

