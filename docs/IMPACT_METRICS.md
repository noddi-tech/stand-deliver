# Impact Metrics — How StandFlow Measures Engineering Output

This document explains every metric, formula, and award in StandFlow's analytics system. All metrics derive from the `external_activity` table, populated by automated GitHub and ClickUp sync functions.

---

## Table of Contents

1. [Data Sources](#data-sources)
2. [Code Impact Score](#code-impact-score)
3. [PR Cycle Time](#pr-cycle-time)
4. [Review Velocity](#review-velocity)
5. [Focus Score](#focus-score)
6. [Work Type Classification](#work-type-classification)
7. [Weekly Awards](#weekly-awards)
8. [DORA-Style Metrics](#dora-style-metrics)
9. [Personal Insights](#personal-insights)
10. [Badge System](#badge-system)
11. [Improving the Metrics](#improving-the-metrics)

---

## Data Sources

All engineering metrics flow from a single table:

```
external_activity
├── source: "github" | "clickup"
├── activity_type: "commit" | "pr_opened" | "pr_merged" | "pr_review" | "task_completed" | ...
├── metadata (JSONB):
│   ├── additions, deletions, files_changed  (commits)
│   ├── created_at, merged_at               (PRs)
│   ├── first_review_at, review_count       (PRs)
│   ├── repo                                (all GitHub)
│   └── work_type                           (AI-classified commits)
└── occurred_at, member_id, team_id
```

**Sync functions** (run every 30 min via pg_cron):
- `github-sync-activity` — fetches commits, PRs, reviews, enriches with stats
- `clickup-sync-activity` — fetches task status changes
- `ai-classify-contributions` — classifies commit messages into work types

**Time window**: Most metrics use a rolling 30-day window. Weekly awards compare the current week vs. the previous week.

---

## Code Impact Score

**Where used**: Member Breakdown cards, My Analytics, Team Analytics trend chart, Weekly Awards (MVP composite)

### Formula

```
Code Impact = sqrt(additions + deletions) × 2
            + files_changed × 1.5
            + |additions - deletions| × 0.1
```

**Source**: `useEnrichedAnalytics.ts → computeCodeImpact()`

### Design Rationale

| Component | Why |
|---|---|
| `sqrt(total_changed) × 2` | **Diminishing returns** on massive diffs. A 10,000-line auto-generated change scores ~200, not 10,000. Prevents bulk changes from dominating. |
| `files_changed × 1.5` | **Breadth bonus**. Cross-cutting changes (refactors, dependency updates) that touch many files score higher even if line counts are modest. |
| `|additions - deletions| × 0.1` | **Small net-lines bonus**. Intentionally tiny — net additions/deletions get a slight bump but don't dominate. Deleting code is equally valued. |

### Example Calculations

| Change | additions | deletions | files | Score |
|---|---|---|---|---|
| Small bugfix: 5 lines changed, 1 file | 3 | 2 | 1 | sqrt(5)×2 + 1×1.5 + 1×0.1 = **6.0** |
| Feature: 200 lines added, 20 deleted, 8 files | 200 | 20 | 8 | sqrt(220)×2 + 8×1.5 + 180×0.1 = **59.7** |
| Large refactor: 500 added, 600 deleted, 30 files | 500 | 600 | 30 | sqrt(1100)×2 + 30×1.5 + 100×0.1 = **121.3** |
| Auto-gen: 10,000 lines, 2 files | 10000 | 0 | 2 | sqrt(10000)×2 + 2×1.5 + 10000×0.1 = **1203** |

### Aggregation

- **Per member**: Sum of all commit impact scores over the 30-day window
- **Per week (trend chart)**: Sum of all commit impact scores for commits in that week
- The score is **rounded to the nearest integer** before display

---

## PR Cycle Time

**Where used**: Team Analytics (trend chart + average), My Analytics (trend), Weekly Digest, DORA metrics

### Formula

```
PR Cycle Time (hours) = merged_at - created_at
```

- Only includes PRs where `activity_type = "pr_merged"`
- **Capped at 720 hours (30 days)** — PRs older than that are excluded as outliers
- Negative values excluded (data integrity guard)

### Aggregation

- **Per member**: Average of all their merged PRs' cycle times
- **Per week**: Average cycle time of all PRs merged that week
- **Team average**: Average of per-member averages (not weighted by PR count)

---

## Review Velocity

**Where used**: Team Analytics (average), My Analytics (insights)

### Formula

```
Review Velocity (hours) = first_review_at - created_at
```

- Measured on `pr_opened` activities that have `first_review_at` in metadata
- Same 720-hour cap as PR Cycle Time
- Represents how quickly the team responds to new PRs

---

## Focus Score

**Where used**: My Analytics (weekly trend), Member Breakdown

### Formula

```
Focus Score = count of distinct repositories touched
```

- Counts unique `metadata.repo` values across all activity types for a member in the time window
- **Lower is more focused** — touching 1-2 repos indicates deep focus, 5+ indicates high context switching

### Insights Generated

- 1-2 repos → "Deep Focus 🎯" (positive)
- 5+ repos → "Context Switching ⚠️" (warning)

---

## Work Type Classification

**Where used**: Team Analytics (stacked bar chart), My Analytics (breakdown)

### How It Works

1. The `github-sync-activity` edge function fetches commit messages
2. The `ai-classify-contributions` edge function sends commit messages to Gemini AI
3. Each commit is classified as one of:

| Type | Description |
|---|---|
| `feature` | New functionality, user-facing changes |
| `bugfix` | Bug fixes, error corrections |
| `refactor` | Code restructuring without behavior change |
| `chore` | Dependencies, configs, CI/CD, non-functional |
| `infra` | Infrastructure, deployment, DevOps |

4. Classification stored in `metadata.work_type`
5. Unclassified commits default to `chore` in visualizations

---

## Weekly Awards

**Where used**: Weekly Digest page, Team Insights, Slack weekly digest

Awards are non-competitive celebrations of specific contributions. No individual leaderboard exists.

### MVP Award 🏆

**Criteria**: Highest composite score this week

```
MVP Score = impactScore + (reviewsGiven × 20) + (commitmentsCompleted × 15)
```

Note: The `impactScore` in awards uses a **slightly simplified formula** (no net-lines term):
```
impactScore = sqrt(additions + deletions) × 2 + files_changed × 1.5
```

**Weights rationale**:
- Each review is valued at 20 impact points (roughly equivalent to a ~25-line change across 2 files)
- Each completed commitment is valued at 15 impact points
- This ensures code reviews and delivery aren't overshadowed by pure code volume

### Unsung Hero Award 🦸

**Criteria**: Highest review-to-PR ratio (minimum 2 reviews given)

```
Hero Ratio = reviewsGiven / max(prsOpened, 1)
```

- Must have ≥2 reviews given to qualify
- Cannot be the same person as MVP
- Celebrates team members who lift others through code review

### Momentum Award 🚀

**Criteria**: Biggest week-over-week improvement (>20% threshold)

```
Improvement = (thisWeekScore - lastWeekScore) / lastWeekScore
```

- Uses the same composite score as MVP
- Must improve by >20% to qualify
- If a member had 0 last week, they qualify only if this week's score > 30
- Cannot be the same person as MVP

---

## DORA-Style Metrics

**Where used**: Team Insights, Weekly Digest

Inspired by the [DORA (DevOps Research and Assessment)](https://dora.dev/) framework but adapted for team standups.

| Metric | StandFlow Implementation | DORA Equivalent |
|---|---|---|
| **Avg PR Cycle Time** | Hours from PR creation to merge | Lead Time for Changes |
| **PR Merge Rate** | Count of PRs merged this week | Deployment Frequency |
| **Change Failure Rate** | Currently 0% (revert detection not implemented) | Change Failure Rate |
| **Review Turnaround** | Hours from PR open to first review | (Custom — not in DORA) |

### Week-over-Week Trends

Each metric shows an arrow (⬆️ ⬇️ ➡️) based on >10% change:
- PR Cycle Time: **down is good** (PRs merging faster)
- Merge Rate: **up is good** (more throughput)
- Reviews: **up is good** (more engagement)

---

## Personal Insights

**Where used**: My Analytics page

Auto-generated insights based on your data trends:

| Insight | Trigger | Sentiment |
|---|---|---|
| PR Cycle Time ⬇️ | Current week avg < 4-week avg | ✅ Positive |
| PR Cycle Time ⬆️ | Current week avg > 1.5× 4-week avg | ⚠️ Warning |
| Team Player 🤝 | Reviews given > 1.5× reviews received AND >3 reviews | ✅ Positive |
| Deep Focus 🎯 | 1-2 repos touched this week | ✅ Positive |
| Context Switching ⚠️ | 5+ repos touched this week | ⚠️ Warning |
| Code Janitor 🧹 | More deletions than additions this week | ✅ Positive |

---

## Badge System

Badges are earned automatically and persist. Evaluated by the `detect-badges` edge function.

| Badge | Criteria | Category |
|---|---|---|
| 🔬 Surgeon | Merged a bugfix PR with <10 lines changed | Engineering |
| 🧹 Janitor | Net negative lines of code in a week | Engineering |
| ⚡ Speed Reviewer | Gave 3+ code reviews in a single week | Collaboration |
| 🤝 Collaborator | Reviewed PRs from 3+ different team members | Collaboration |
| 🎯 Promise Keeper | Completed all commitments 5 days in a row | Delivery |
| 🚀 Shipper | Merged a PR within 4 hours of opening | Engineering |
| 🔥 Streak | Daily commits for 2+ consecutive weeks | Consistency |
| 🏗️ Architect | First commit to a new repository | Engineering |
| 🎉 First Commit | First-ever commit synced to StandFlow | Milestone |
| 🛡️ Guardian | Reviewed and approved a critical PR | Collaboration |

---

## Improving the Metrics

### Known Limitations

1. **Code Impact is code-centric**: Only measures GitHub commits. ClickUp task completions, Slack discussions, design work, and other contributions are invisible to the impact score.

2. **No PR size normalization**: A 1-file, 3-line surgical fix scores lower than a sprawling 30-file refactor, even if the fix is more valuable.

3. **Review quality not measured**: All reviews count equally — a thorough 30-comment review scores the same as an LGTM.

4. **Work type classification depends on commit messages**: Poor commit messages → poor classification. Squash-merged PRs lose individual commit context.

5. **Change Failure Rate is always 0%**: Revert detection is not implemented yet.

6. **Focus Score treats all repos equally**: A monorepo touching `frontend/` and `backend/` dirs appears as 1 repo, while a poly-repo setup counts as many.

### Potential Improvements

- **Weight reviews by comment count** to reward thorough reviews
- **Include ClickUp task points** in the composite score (once points are synced)
- **Detect reverts** via commit message patterns (`revert`, `Revert "..."`) for Change Failure Rate
- **Normalize by working days** — someone working 3 days shouldn't be compared to someone working 5
- **Add design/docs contributions** via ClickUp task type detection
- **PR size buckets** — show distribution of small/medium/large PRs per member
