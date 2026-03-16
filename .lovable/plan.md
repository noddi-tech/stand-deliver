

# VIS Implementation — Verification & Fixes

I've inspected all the implemented files against your three checks. Here's the status:

## 1. RLS on `impact_classifications` — GOOD

The table has SELECT-only for authenticated team members (`is_team_member(auth.uid(), team_id)`). No INSERT/UPDATE/DELETE policies for authenticated users — all writes go through edge functions using the service role key. User A cannot read User B's classifications unless they're on the same team. This is correct.

## 2. Missing `.catch()` on MyStandup fire-and-forget — NEEDS FIX

Current code (line 688-694):
```typescript
supabase.functions
  .invoke("ai-classify-contributions", { body })
  .then(({ error: classErr }) => {
    if (classErr) console.error("VIS standup classification failed:", classErr);
  });
```

The `.then()` handles Supabase SDK-level errors (returned as `{ error }`), but a network-level promise rejection (e.g., timeout, DNS failure) would be an unhandled rejection. Need to add `.catch()`.

**Fix**: Add `.catch(err => console.warn('[VIS] standup classification failed:', err))` after the `.then()`.

## 3. GitHub sync batching loop — GOOD

Lines 997-1013 already implement the correct chunking pattern:
```typescript
for (let b = 0; b < toClassify.length; b += 20) {
  const batch = toClassify.slice(b, b + 20);
  // ... fetch call per batch
}
```

This handles 60+ activities correctly by sequentially processing groups of 20.

## 4. ClickUp sync — ISSUE

The ClickUp VIS classify block (lines 151-160) still uses the **old pattern** from before the rewrite. It uses `task.id` (the ClickUp external ID) as `activity_id` and then does a secondary lookup to map to `external_activity.id`. This works but is unnecessarily complex — and the `statusName` variable on line 156 references a variable that's scoped inside the per-task loop above (line 82), making it potentially stale or undefined in this context since it's outside that loop.

This is pre-existing code that wasn't updated during the VIS implementation. It should be replaced with the same pattern used in `github-sync-activity`: collect upserted `external_activity` IDs after the task loop, then batch-classify.

## Summary of changes needed

| File | Fix |
|---|---|
| `src/pages/MyStandup.tsx` | Add `.catch()` to the fire-and-forget classification call |
| `supabase/functions/clickup-sync-activity/index.ts` | Replace the old VIS classify block with the clean pattern: collect activity IDs after upsert loop, batch-classify with proper `external_activity.id` references |

Both are small, targeted fixes. No schema or scoring logic changes needed.

