

# Developer Productivity Metrics & Gamification — Phased Implementation Plan

This is a large initiative. I'll break it into four phases matching your priority order, with Phase 1 being the immediate next step.

---

## Phase 1 — Enrich the Sync (Data Foundation)

**Problem**: Currently, commit metadata only stores `{ repo, sha }` and PR metadata only stores `{ repo, number }`. No diff stats, no review data, no cycle time data. Everything downstream depends on having richer data.

### Changes to `github-sync-activity/index.ts`

**1a. Fetch commit stats** — After collecting commits, batch-fetch individual commit details (`GET /repos/{owner}/{repo}/commits/{sha}`) to get `stats.additions`, `stats.deletions`, `files.length`. Store in metadata:
```
metadata: { repo, sha, additions, deletions, files_changed }
```
Use existing `DETAIL_BATCH_SIZE` pattern with `fetchWithTimeout` to stay within time budget. Only fetch details for commits that don't already have `additions` in their metadata (skip on re-sync).

**1b. Fetch PR review data** — For each PR (opened or merged), fetch `GET /repos/{owner}/{repo}/pulls/{number}/reviews` to get review count, reviewers, and timestamps. Store:
```
metadata: { repo, number, additions, deletions, files_changed, review_count, first_review_at, merged_at, created_at }
```

**1c. Store PR reviews as separate activity items** — When a user reviews someone else's PR, create an `activity_type: "pr_review"` entry. This requires scanning reviews across org repos for each user (similar to merged-by detection). To limit API cost, only do this for PRs already fetched.

**1d. AI-classify commit type** — Use the Lovable AI Gateway (already used for standup coach) to classify commit messages in batch. Call once per sync with all new commit titles, get back `feature | bugfix | refactor | chore | infra` labels. Store as `metadata.work_type`. This replaces the current regex-based classification in `useAnalytics.ts`.

### Database

No schema change needed — `external_activity.metadata` is already JSONB and can hold the new fields. Existing records keep working (null fields = not yet enriched).

### Estimated API cost
- ~1 extra API call per commit (detail endpoint) — bounded by time budget
- ~1 extra API call per PR (reviews endpoint)
- ~1 AI Gateway call per sync batch

---

## Phase 2 — Enhanced Analytics Dashboard

Build on the enriched data to show meaningful metrics instead of vanity numbers.

### New metrics in `useAnalytics.ts`

| Metric | Source | Calculation |
|--------|--------|------------|
| Code Impact Score | `metadata.additions/deletions/files_changed` | Weighted composite per member |
| PR Cycle Time | `metadata.created_at` → `metadata.merged_at` | Average hours, trend over weeks |
| Review Velocity | `pr_review` activity items | Avg hours from PR open to first review |
| Reviews Given/Received ratio | `pr_review` items | Per-member ratio |
| Code Churn Ratio | Sequential commit diffs to same files | Percentage of code re-changed within 2 weeks |
| Focus Score | Distinct repos touched per week | Lower = more focused = better |

### UI changes to `Analytics.tsx`

- Replace current "Work Distribution" (regex-based) with AI-classified work type breakdown
- Add "PR Cycle Time" trend chart (line chart, weeks on X axis)
- Add "Review Health" card showing team average review turnaround
- Keep existing Member Breakdown but add Impact Score, Reviews Given, and Cycle Time columns

### UI changes to `MyAnalytics.tsx` (Personal Dashboard)

- Add "Your PR Cycle Time" trend (this week vs 4-week avg)
- Add "Reviews Given vs Received" bar chart
- Add "Code Impact" trend showing your weighted contribution over time
- Replace generic insight cards with data-driven personal insights ("Your average PR size is trending smaller — great for review speed")

---

## Phase 3 — Achievement Badges

### New database tables

```sql
CREATE TABLE public.badge_definitions (
  id text PRIMARY KEY,  -- e.g. 'surgeon', 'speed_reviewer'
  name text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL,
  category text NOT NULL DEFAULT 'personal',  -- 'personal' | 'weekly'
  criteria jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE public.member_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL,
  team_id uuid NOT NULL,
  badge_id text NOT NULL REFERENCES badge_definitions(id),
  earned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}',
  UNIQUE(member_id, badge_id, earned_at::date)
);
```

### Badge detection logic

New edge function `detect-badges` called after each sync completes. Queries recent `external_activity` and `commitments` to check badge criteria:

- **Surgeon**: PR merged with `additions + deletions < 10` that fixes a bug (`work_type = 'bugfix'`)
- **Janitor**: Net negative LOC in a week (`SUM(additions - deletions) < 0`)
- **Speed Reviewer**: 3+ reviews within 2 hours of request
- **Promise Keeper**: 5 consecutive days with all standup commitments completed
- **Collaborator**: Co-authored commits with 3+ different team members in 30 days
- **Shipper**: PR opened → merged in under 4 hours
- **Streak**: Committed every workday for 2 weeks

### UI

- Badges displayed on Member Breakdown cards in Analytics
- Personal badge showcase on MyAnalytics page
- Badge earned toast notification
- Badge icons in Team Feed next to member names

---

## Phase 4 — Weekly Awards & Team Momentum

### Weekly awards (auto-detected)

- **MVP**: Highest composite of impact score + reviews given + cycle time
- **Unsung Hero**: Most reviews given relative to own PRs
- **Momentum**: Biggest week-over-week improvement

### Team-level dashboard

- DORA-style metrics: avg PR cycle time, deployment frequency (PR merge rate), change failure rate (reverted PRs)
- Week-over-week trend arrows on each metric
- AI-generated weekly narrative (extend existing `ai-weekly-digest` to include the new metrics)

### No individual leaderboard

Frame everything as team progress and personal growth. No ranking individuals against each other.

---

## Recommended Implementation Order

**Start with Phase 1** — it's the foundation everything else depends on. Without enriched metadata, Phases 2-4 have no data to work with. Phase 1 is entirely backend (edge function changes, no UI), so it can be deployed and backfilled before touching the frontend.

Shall I proceed with Phase 1?

