

## Status of All 10 Badges

The `badge_definitions` table has all 10 badges seeded. However, the `detect-badges` edge function only implements detection for **8 of 10**. Two are missing:

| Badge | Seeded | Detection Logic | Status |
|-------|--------|----------------|--------|
| Surgeon | Yes | Yes | Working |
| Janitor | Yes | Yes | Working |
| Shipper | Yes | Yes | Working |
| Streak | Yes | Yes | Working |
| Promise Keeper | Yes | Yes | Working |
| Speed Reviewer | Yes | Partial — checks 3+ reviews total, NOT "within 2 hours of request" | Needs fix |
| Collaborator | Yes | Yes (via reviewed PR authors) | Working |
| First Commit | Yes | Yes | Working |
| **Architect** | Yes | **No detection logic** | Missing |
| **Guardian** | Yes | **No detection logic** | Missing |

## Plan

### 1. Add Architect detection
Query `external_activity` for PRs where `metadata.files_changed >= 5`. The GitHub API doesn't give us directory count directly, but the enriched sync stores `files_changed`. We can either:
- Use `files_changed >= 5` as the threshold (simpler, since directory info isn't stored yet), or
- Fetch the PR files list in the sync to count distinct directories.

For now, use `files_changed >= 5` as a reasonable proxy — most PRs touching 5+ files span multiple directories.

### 2. Add Guardian detection
Check for `pr_review` activity items where the reviewed PR subsequently had commits pushed after the review (indicating the review caught something). This requires comparing `metadata.reviewed_at` against subsequent commit timestamps on the same PR. If review data doesn't include enough detail, fall back to: reviewer left 2+ comments on a PR that was later merged (suggesting substantive review).

### 3. Fix Speed Reviewer criteria
Change from "3+ reviews total in 30 days" to "3+ reviews where time from PR opened to review was under 2 hours." This requires `metadata.pr_created_at` and `metadata.reviewed_at` on `pr_review` activity items.

### Technical approach
All changes are in `supabase/functions/detect-badges/index.ts` — add two new detection blocks and tighten the Speed Reviewer logic.

