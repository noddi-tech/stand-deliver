

## Dashboard with Real Data

### New Files

**`src/hooks/useTeamMetrics.ts`** — React Query hook fetching last 14 days of commitments, blockers, standup_responses, and standup_sessions for the current team. Calculates:
- Health score: `(completionRate * 0.4 + blockerResolutionRate * 0.25 + (1 - carryRate) * 0.2 + participationRate * 0.15) * 100`
- Completion rate + daily sparkline data (14 points)
- Active blockers count + flag if any > 2 days old
- Carry-over rate (commitments with carry_count >= 1 / total)
- staleTime: 30000

**`src/hooks/useAttentionItems.ts`** — Queries:
- Commitments where `carry_count >= 2` AND status IN `(active, carried, in_progress)` with member profile join
- Blockers where `is_resolved = false` AND `created_at < now() - 2 days` with member profile join
- Returns both arrays for the "Needs Attention" section

**`src/hooks/useTeamMembers.ts`** — Queries all active `team_members` for current team with profiles join. For each member:
- Count open commitments (status IN active/carried/in_progress/blocked)
- Check if standup_response exists for today's session
- Get latest mood from most recent response
- staleTime: 30000

### Modified Files

**`src/pages/Dashboard.tsx`** — Complete rewrite with 4 sections:

1. **Header**: "Dashboard" title + user greeting + standup CTA button (checks today's session/response status → "Start Today's Standup" / "Complete Your Standup" / "View Today's Standup ✅")

2. **Metrics row** (4 MetricCards):
   - Team Health: HealthGauge component (reuse existing)
   - Completion Rate: percentage + tiny Recharts `<LineChart>` sparkline
   - Active Blockers: count + red badge if old blockers exist
   - Carry-Over Rate: percentage

3. **Needs Attention section**: Cards with amber border (carry-overs) / red border (old blockers), showing title, owner avatar+name, carry count or days open, link to /standup

4. **Team Members grid**: Avatar, name, role badge, open commitment count, submission status icon, last mood emoji. Skeleton loaders for each section.

Uses `useUserTeam()` from existing `useAnalytics.ts` to get teamId/memberId, then passes to the 3 new hooks.

### Technical Details
- All queries use `subDays(new Date(), 14)` for the 14-day window
- Sparkline uses Recharts `<LineChart>` with no axes, just a clean line (height ~30px)
- Mood emojis map: great→🚀, good→👍, okay→😐, struggling→😓, rough→😰
- Loading states show Skeleton components matching card dimensions
- Today's session check: query `standup_sessions` for today's date + `standup_responses` for current member

