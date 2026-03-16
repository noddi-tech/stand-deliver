

# Needs Attention Deduplication + Impact Measurement README

## 1. Needs Attention Stacking Bug

**Root cause**: The same member can appear in multiple categories simultaneously. For example, "Tom Arne Danielsen" shows as both "Hasn't submitted today's standup" AND "Has never submitted a standup". The `staleMembers` query in `useAttentionItems.ts` doesn't exclude members already listed in `missingStandups`.

**Fix in `src/hooks/useAttentionItems.ts`**:
- After computing `missingStandups`, create a `Set` of those member IDs
- Filter `staleMembers` to exclude anyone already in `missingStandups`
- This ensures each person appears in only the most relevant/urgent category

## 2. Impact Measurement README

Create `docs/IMPACT_METRICS.md` documenting how impact is measured across the system. Content based on actual code analysis:

### Code Impact Score (`computeCodeImpact`)
- Formula: `sqrt(additions + deletions) * 2 + filesChanged * 1.5 + abs(additions - deletions) * 0.1`
- Used in: Member Breakdown, My Analytics, Team Analytics trends
- Design rationale: Square root creates diminishing returns on massive diffs; file breadth bonus rewards cross-cutting changes; net lines bonus is intentionally small

### Weekly Awards (MVP composite)
- Formula: `impactScore + reviewsGiven * 20 + commitmentsCompleted * 15`
- The `impactScore` itself uses a slightly different formula in awards: `sqrt(adds + dels) * 2 + files * 1.5` (no net lines term)

### Other metrics documented
- **PR Cycle Time**: Hours from PR creation to merge (capped at 720h/30 days)
- **Review Velocity**: Hours from PR creation to first review
- **Focus Score**: Count of distinct repositories touched
- **Work Type Breakdown**: Classified from commit metadata (feature/bugfix/refactor/chore/infra)
- **Unsung Hero award**: Highest review-to-PR ratio
- **Momentum award**: Biggest week-over-week composite improvement

### Where data originates
- All metrics derive from `external_activity` table (source: `github`)
- Metadata fields used: `additions`, `deletions`, `files_changed`, `created_at`, `merged_at`, `first_review_at`, `repo`, `work_type`, `review_count`
- Sync functions: `github-sync-activity`, `clickup-sync-activity`
- AI classification: `ai-classify-contributions` for work type tagging

## Files to change

| File | Change |
|---|---|
| `src/hooks/useAttentionItems.ts` | Filter staleMembers to exclude missingStandups member IDs |
| `docs/IMPACT_METRICS.md` | New file: detailed explanation of all impact/metric formulas |

