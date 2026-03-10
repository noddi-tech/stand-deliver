

## Plan: Enhanced Analytics with AI + Activity Page + Meeting Mode Bug Fix

### Research: Analytics Dashboard Improvements

The current analytics page shows raw metrics (health score, completion rate, blockers, carry-over) with charts (work distribution, commitment funnel, blocker heatmap, participation, trending themes). It's purely quantitative with no per-member breakdown, no AI interpretation, and no actionable narrative.

**What good team analytics dashboards do:**
- Surface **individual contribution visibility** (not as a leaderboard, but as context for leads)
- Provide **AI-generated narrative summaries** that interpret the numbers ("Joachim completed 8/10 items this week — strong velocity. Stiffi has 3 carried items and no standup submissions in 4 days — may need a check-in.")
- Show **trends over time per person** (completion rate trajectory, mood patterns, activity volume)
- Highlight **outliers** — both positive (celebrations) and concerning (someone going quiet)
- Use the existing `external_activity` data (GitHub commits, PRs, ClickUp tasks) to show real work output alongside standup self-reports

**AI approach:** Create an edge function `ai-team-summary` that takes the team's recent data (commitments, blockers, activity, responses) and generates:
1. A team-level narrative summary
2. Per-member highlights (who's crushing it, who might need support)
3. Actionable recommendations

This uses the Lovable AI Gateway (LOVABLE_API_KEY is already configured).

---

### 1. Enhanced Analytics Dashboard

**Current state:** Team-level aggregate charts only. No per-member view. No AI insights.

**Changes:**

**a) New edge function `ai-team-summary/index.ts`:**
- Accepts `team_id` and a `period` (e.g., "7d")
- Queries commitments, blockers, standup_responses, external_activity for each member
- Sends structured data to Lovable AI Gateway (gemini-3-flash-preview) with a prompt like:
  > "You are a team performance analyst. Given the following data for each team member, provide: 1) A 2-3 sentence team summary, 2) Per-member highlights (celebrate wins AND flag concerns like low activity, carried items, missing standups), 3) Two actionable recommendations. Be direct — it's OK to say someone needs to step up."
- Returns structured JSON via tool calling

**b) Update `Analytics.tsx`:**
- Add an "AI Summary" card at the top that calls the edge function and displays the narrative
- Add a "Member Breakdown" section below existing charts showing per-member stats:
  - Completion rate, carry count, standup participation, mood trend, activity count (commits + PRs + tasks)
  - Small bar chart or sparkline per member
  - AI highlight badge per member (e.g., "Strong week" or "Needs check-in")

**c) Update `useAnalyticsMetrics` hook:**
- Add per-member metrics to the returned data (already has all the raw data, just needs to group by `member_id`)

### 2. New Activity Page (`/activity`)

**Purpose:** Dedicated page for browsing all team activity, filterable by member. Useful for longer sync meetings and 1:1s.

**Changes:**

**a) New page `src/pages/Activity.tsx`:**
- Full-page activity feed (reuses `useRecentActivity` but with extended date range — 30 days)
- Filter bar: member dropdown (multi-select), source filter (GitHub/ClickUp/Standup), date range
- Activity items shown in a timeline layout with grouping by date
- Click on a member card in Dashboard to navigate here with that member pre-filtered
- Show activity counts summary at top (X commits, Y PRs, Z tasks, W standups)

**b) Update `useRecentActivity.ts`:**
- Accept optional `memberId` and `days` parameters for filtering
- Increase limit when used on the Activity page

**c) Add route and sidebar nav:**
- Add `/activity` route in `App.tsx`
- Add "Activity" nav item in `AppSidebar.tsx` (use `Activity` icon from lucide)

**d) Dashboard link:**
- Make "Recent Activity" header a link to `/activity`
- Make member cards clickable to go to `/activity?member={id}`

### 3. Meeting Mode Bug Fix

**Bug:** After skipping today's standup, the Meeting Mode pre-screen still shows "Pending" for the skipped user. It also doesn't indicate the next scheduled meeting day.

**Root causes:**
- Meeting Mode queries `standup_responses` to determine who submitted, but doesn't distinguish "Skipped" from regular submissions — a skip IS a response, so Tom Arne should show as "Skipped" not "Submitted"
- The pre-screen doesn't use `standup_days` from the team config to show next meeting info
- No visual distinction for skipped members

**Fixes in `MeetingMode.tsx`:**
- Query responses including `yesterday_text` and `mood` fields
- Show three states on member cards: "Submitted" (green), "Skipped" (yellow/gray), "Pending" (dimmed)
- Add a line below the date showing: "Next standup: Thursday, Mar 12" by computing the next day from `standup_days`
- If today is NOT a standup day, show a notice: "No standup scheduled today. Next: Thursday, Mar 12"

---

### Files Changed

| File | Change |
|------|--------|
| New: `supabase/functions/ai-team-summary/index.ts` | AI-powered team analysis edge function |
| New: `src/pages/Activity.tsx` | Dedicated activity feed page with member filtering |
| `src/pages/Analytics.tsx` | Add AI summary card + per-member breakdown section |
| `src/hooks/useAnalytics.ts` | Add per-member metrics grouping |
| `src/hooks/useRecentActivity.ts` | Add memberId/days params for Activity page |
| `src/pages/MeetingMode.tsx` | Fix skip status display + show next meeting date |
| `src/pages/Dashboard.tsx` | Link activity header + member cards to Activity page |
| `src/App.tsx` | Add `/activity` route |
| `src/components/AppSidebar.tsx` | Add Activity nav item |
| `supabase/config.toml` | Add `ai-team-summary` function entry |

