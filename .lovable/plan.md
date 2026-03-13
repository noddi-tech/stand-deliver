

## Fix: Use Full Engineering Data in AI Summary + Trigger Badge Detection

### The Problem
Two things are broken:

1. **Badges are never awarded** — `member_badges` table is empty. The `detect-badges` function exists with all 10 badge rules but nothing ever calls it.

2. **AI team summary ignores rich engineering data** — It only passes shallow counts to the AI (`githubCommits: 43, prs: 53`), but we have deep metadata on every activity: LOC added/deleted, files changed, PR cycle times, first review times, work types, review counts. Syver has 43 commits + 91 PRs and Anders has 86 commits + 47 PRs in 7 days — they're clearly very active, but the AI doesn't see enough detail to say that meaningfully.

### Plan

#### 1. Trigger `detect-badges` automatically (3 places)

**`supabase/functions/github-sync-activity/index.ts`** — After sync completes, call `detect-badges` for each team that had new activity.

**`supabase/functions/clickup-sync-activity/index.ts`** — Same, invoke `detect-badges` after processing.

**`supabase/functions/daily-summary-cron/index.ts`** — Add a `detect-badges` call for each team as a daily safety net.

All three use an internal `fetch()` to the edge function URL with the service role key.

#### 2. Enrich `ai-team-summary` with deep engineering metrics

**`supabase/functions/ai-team-summary/index.ts`** — Compute and pass per-member:

- **Total LOC** (additions + deletions from commit metadata)
- **Avg files per PR** (from `files_changed` in PR metadata)
- **PR cycle time** (median `merged_at - created_at` from PR metadata)
- **Review velocity** (median `first_review_at - created_at`)
- **Work type breakdown** (count of `feature`, `bugfix`, `refactor`, `chore` from `metadata.work_type`)
- **Reviews given** (count of `pr_review` activity)
- **Badges earned** (query `member_badges` and include names)

Update the `memberStats` shape to include an `engineering` object with these fields. Update the AI prompt to explicitly say: "Engineering output (commits, PRs, LOC, reviews) is the PRIMARY signal of productivity — weigh it heavily. A member with high commit/PR output is productive even if standup participation is low. You MUST return exactly one highlight per member."

#### 3. Show badges on Dashboard and Team Feed

**`src/pages/Dashboard.tsx`** and **`src/pages/TeamFeed.tsx`** — Import `MemberBadgeIcons` and `useBadgeLookup`/`useTeamBadges`, render badge emojis next to member names where member cards appear.

### Summary of file changes

| File | Change |
|------|--------|
| `supabase/functions/github-sync-activity/index.ts` | Call `detect-badges` after sync |
| `supabase/functions/clickup-sync-activity/index.ts` | Call `detect-badges` after sync |
| `supabase/functions/daily-summary-cron/index.ts` | Call `detect-badges` per team |
| `supabase/functions/ai-team-summary/index.ts` | Compute deep engineering metrics per member, include badges, update prompt |
| `src/pages/Dashboard.tsx` | Add `MemberBadgeIcons` to member cards |
| `src/pages/TeamFeed.tsx` | Add `MemberBadgeIcons` to feed entries |

