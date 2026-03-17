

# Activity Badge System — Combined Implementation Plan

## Overview

Every activity in StandFlow gets a visible work-type badge (e.g. `🐛 Bug Fix`, `🚀 Feature`) via a 4-layer priority chain: Manual override > Deterministic rules > AI classification > Source defaults. The system never shows "untagged."

## 1. Database Migration

Create `activity_badges` table + INSERT policy (missing from prior plan iterations):

```sql
CREATE TABLE public.activity_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL,
  source_type text NOT NULL,
  team_id uuid NOT NULL,
  badge_key text NOT NULL,
  badge_source text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.5,
  manual_override boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_activity_badges_unique ON activity_badges (activity_id, source_type);
ALTER TABLE activity_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view activity badges"
  ON activity_badges FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can insert activity badges"
  ON activity_badges FOR INSERT TO authenticated
  WITH CHECK (is_team_member(auth.uid(), team_id));
CREATE POLICY "Team members can update activity badges"
  ON activity_badges FOR UPDATE TO authenticated
  USING (is_team_member(auth.uid(), team_id));
```

## 2. Shared Resolver: `supabase/functions/_shared/activity-badges.ts`

Single file containing **all code verbatim from the spec artifact**:

- **Types**: `ActivityBadge`, `BadgeResolution`
- **`ALL_BADGES`** — 19-entry catalog (bugfix, feature, refactor, infra, docs, test, security, perf, chore, design, growth, review, review_deep, review_light, hotfix, unblock, task, commitment, style)
- **`COMMIT_PREFIX_MAP`** — 13 conventional commit prefixes (fix, feat, refactor, chore, docs, test, ci, build, perf, style, revert, security, hotfix)
- **`badgeFromCommitMessage(message)`** — regex `^(\w+)(?:\(.+?\))?!?:` then keyword fallbacks (hotfix/urgent, fix/bug/patch, add/new/implement, refactor/clean, test/spec, doc/readme, deps/bump/ci)
- **`PR_LABEL_MAP`** — 9 GitHub label strings mapped to badges
- **`badgeFromPR(labels, title)`** — labels first, falls back to `badgeFromCommitMessage(title)`
- **`badgeFromReview(commentCount)`** — 5+ = Deep Review, 1+ = Review, 0 = Approval
- **`CLICKUP_LIST_MAP`** — 9 list name keywords
- **`badgeFromClickUpTask(listName, tags)`** — tags first, then list name substring
- **`badgeFromCommitment(text)`** — keyword patterns: fix/bug/patch/resolve, ship/launch/deploy/release, review/pr/feedback, design/figma/mockup/ui, call/meeting/demo/customer/onboard, doc/write/spec, refactor/clean
- **`VALUE_TYPE_BADGE_MAP`** — AI value_type to badge, with quality+critical = Hotfix override
- **`SOURCE_DEFAULTS`** — fallback by activity_type
- **`resolveActivityBadge(activity)`** — the 4-priority resolver
- **`upsertBadge(sb, activity, teamId)`** — async helper that resolves + upserts into `activity_badges` with `ON CONFLICT ... WHERE badge_source != 'manual'`

Header: `/** CANONICAL VERSION — client copy at src/lib/activity-badges.ts */`

## 3. Edge Function Integration

### `github-sync-activity/index.ts`

Import `upsertBadge` from `_shared/activity-badges.ts`. Call at 4 insertion points:

| Location | After upsert of | Key data |
|---|---|---|
| ~line 691 | commits | `source: 'github', activity_type: 'commit', title: message` |
| ~line 730 | PRs opened | `activity_type: 'pr_opened', metadata.labels` |
| ~line 760 | PRs merged | `activity_type: 'pr_merged', metadata.labels` |
| ~line 860 | PR reviews | `activity_type: 'pr_review', metadata.review_comments` |

One `upsertBadge()` call per point — no copy-pasted logic.

### `clickup-sync-activity/index.ts`

After task upsert (~line 120), call `upsertBadge()` with `metadata: { list_name: task.list?.name, tags: task.tags?.map(t=>t.name) || [] }`.

### `ai-classify-contributions/index.ts`

After the existing classification upsert loop (after line 277), add a **bulk badge upsert** for all classified items. For each classified item, compute badge via `badgeFromAIClassification()` and collect rows, then upsert using an RPC or raw approach with this SQL pattern:

```sql
INSERT INTO activity_badges (activity_id, source_type, team_id, badge_key, badge_source, confidence)
VALUES ($1, $2, $3, $4, 'ai', 0.7)
ON CONFLICT (activity_id, source_type)
DO UPDATE SET badge_key = EXCLUDED.badge_key, badge_source = 'ai', confidence = 0.7, updated_at = now()
WHERE activity_badges.badge_source != 'manual'
  AND activity_badges.confidence < 0.9;
```

No SELECT-then-UPDATE. One statement per item. Deterministic badges (0.9) kept. Manual badges never touched.

Since Supabase JS `.upsert()` doesn't support conditional WHERE on conflict, create a small Postgres function `upsert_activity_badge(...)` that wraps this SQL, called via `sb.rpc()`.

### Standup integration (`ai-classify-contributions` handles it)

`MyStandup.tsx` (~line 687) already fires `ai-classify-contributions` for commitment items. Since we're adding badge resolution to `ai-classify-contributions`, commitments get badges automatically via that path. The deterministic `badgeFromCommitment()` runs inside `resolveActivityBadge()` during the bulk badge upsert step — no separate call needed from MyStandup. The AI classifier receives commitment items with `source: 'standup'` and `activity_type: 'commitment'`, so the resolver dispatches to `badgeFromCommitment(title)` for deterministic matching before falling back to AI.

## 4. Frontend

### `src/lib/activity-badges.ts` (new)

Client copy of `ALL_BADGES` map + `ActivityBadge` type only (no resolver logic). Header: `/** CANONICAL: supabase/functions/_shared/activity-badges.ts — keep in sync */`

### `src/hooks/useActivityBadges.ts` (new)

- Takes `activityIds: string[]`
- Single `.from('activity_badges').select('*').in('activity_id', ids)` query
- Returns `Record<string, { badgeKey: string; badgeSource: string }>`
- Exposes `overrideBadge(activityId, sourceType, badgeKey, teamId)` mutation (upserts with `manual_override: true`)

### `src/hooks/useRecentActivity.ts`

Extend `ActivityItem` with optional `badgeKey`, `badgeSource`. After fetching activities, batch-fetch badges via single `.in('activity_id', ids)`, merge into items.

### `src/pages/Activity.tsx`

- Render `ActivityBadgeChip` (emoji + label pill) per item
- On click, show `BadgePicker` popover for manual override
- Add badge key filter to existing filter bar

### `src/components/activity/ActivityBadgeChip.tsx` (new)

Small pill: `inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted/50`. Clickable to open picker.

### `src/components/activity/BadgePicker.tsx` (new)

Popover grid of all 19 badges from `ALL_BADGES`. Selecting one calls `overrideBadge` mutation.

## 5. Database function for conditional upsert

```sql
CREATE OR REPLACE FUNCTION public.upsert_activity_badge(
  p_activity_id uuid, p_source_type text, p_team_id uuid,
  p_badge_key text, p_badge_source text, p_confidence numeric
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO activity_badges (activity_id, source_type, team_id, badge_key, badge_source, confidence)
  VALUES (p_activity_id, p_source_type, p_team_id, p_badge_key, p_badge_source, p_confidence)
  ON CONFLICT (activity_id, source_type)
  DO UPDATE SET
    badge_key = EXCLUDED.badge_key,
    badge_source = EXCLUDED.badge_source,
    confidence = EXCLUDED.confidence,
    updated_at = now()
  WHERE activity_badges.badge_source != 'manual'
    AND activity_badges.confidence < EXCLUDED.confidence;
$$;
```

This function is used by both `upsertBadge()` in edge functions and the bulk AI classification step.

## Files Summary

| File | Action |
|---|---|
| Migration SQL | Create `activity_badges` table + RLS + `upsert_activity_badge` function |
| `supabase/functions/_shared/activity-badges.ts` | Create — full catalog, all matchers (verbatim from spec), resolver, `upsertBadge` helper |
| `supabase/functions/github-sync-activity/index.ts` | Add `upsertBadge()` call at 4 insertion points |
| `supabase/functions/clickup-sync-activity/index.ts` | Add `upsertBadge()` call after task upserts |
| `supabase/functions/ai-classify-contributions/index.ts` | Add bulk badge upsert via `upsert_activity_badge` RPC after classification loop |
| `src/lib/activity-badges.ts` | Create — client badge catalog (drift-detection copy) |
| `src/hooks/useActivityBadges.ts` | Create — fetch badges via `.in()`, expose manual override |
| `src/hooks/useRecentActivity.ts` | Extend ActivityItem, merge badge data |
| `src/pages/Activity.tsx` | Render badges, add picker + filter |
| `src/components/activity/ActivityBadgeChip.tsx` | Create — badge pill component |
| `src/components/activity/BadgePicker.tsx` | Create — manual override popover |
| `supabase/config.toml` | No changes needed (functions already have verify_jwt = false) |

