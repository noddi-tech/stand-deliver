

# AI Intelligence Features for StandFlow

## 1. Database Migration

Create `focus_recommendations` table:
- id (uuid, PK), team_id (FK teams), member_id (FK team_members), session_id (FK standup_sessions, nullable), recommendation_type (text, CHECK in 6 values), title (text), description (text), priority (text), is_dismissed (boolean, default false), created_at (timestamptz, default now())
- Create enum `recommendation_type` for the 6 types
- RLS: team members can view/insert; members can update own (dismiss)

## 2. Edge Functions (4 new, using Lovable AI Gateway)

All functions use `LOVABLE_API_KEY` (already available) via `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-3-flash-preview`.

**a. `ai-parse-commitments`**
- Input: `{ today_text: string }`
- Calls Lovable AI with tool calling to extract `[{title, scope}]` from free-text
- Returns parsed commitments as JSON array
- Graceful fallback: if AI fails, return empty array with `ai_failed: true` flag

**b. `ai-detect-blockers`**
- Input: `{ text: string }` (blockers_text + today_text)
- Uses Lovable AI tool calling to extract `[{description, category}]`
- Also does keyword-based fallback detection (blocked, waiting, stuck, depends on, need X from)
- Returns detected blockers with suggested categories

**c. `ai-summarize-session`**
- Input: `{ session_id: string }`
- Fetches all responses for session via service role client
- Calls Lovable AI to generate 3-5 sentence summary
- Updates `standup_sessions.ai_summary`
- Optionally posts to Slack if team has `slack_channel_id` configured (calls existing `slack-post-summary` pattern)

**d. `ai-weekly-digest`**
- Input: `{ team_id: string }`
- Aggregates week's commitments, blockers, responses
- Calls Lovable AI for narrative + recommendations via tool calling
- Inserts into `ai_weekly_digests` table
- Can be triggered manually or via cron

## 3. Frontend Components

**AI Commitment Parser (chip/tag UI)**
- New component `src/components/ai/CommitmentParser.tsx`
- After user types today_text and blurs/submits, calls `ai-parse-commitments`
- Shows parsed commitments as editable chips with edit/remove/add actions
- "AI-powered" badge, loading spinner during parsing
- Thumbs up/down feedback buttons

**AI Blocker Detection (inline alerts)**
- New component `src/components/ai/BlockerDetector.tsx`
- Monitors blockers_text + today_text fields
- Shows detected blockers as dismissible alert cards with suggested category
- User can confirm (auto-fills blocker) or dismiss

**AI Focus Recommendations (cards above standup form)**
- New component `src/components/ai/FocusRecommendations.tsx`
- Fetches from `focus_recommendations` table for current member
- Renders dismissible cards with warm tone: focus suggestions, carry-over warnings (3+ carries), celebration cards
- "AI-powered" sparkle badge
- Thumbs up/down feedback

**Weekly Digest View**
- Accessible from Dashboard as a card/link
- Shows latest `ai_weekly_digests` record: health score gauge, narrative text, recommendation list, work distribution summary
- Reuses existing `HealthGauge` and `MetricCard` components

## 4. Integration Points

- `ai-summarize-session` called after standup collection completes (triggered from frontend or as part of session completion flow)
- AI summary displayed at top of Team Feed page (read from `standup_sessions.ai_summary`)
- Weekly digest posted to Slack via existing Slack edge function infrastructure
- All AI content marked with subtle "AI-powered" badge (sparkle icon + text)

## 5. Config Updates

- Add all 4 new edge functions to `supabase/config.toml` with `verify_jwt = false`
- Validate JWT in code using `getClaims()` for `ai-parse-commitments`, `ai-detect-blockers`
- `ai-summarize-session` and `ai-weekly-digest` use service role (triggered server-side or by leads)

## 6. Graceful Fallbacks

- Every AI call wrapped in try/catch
- On failure: return fallback data with `ai_available: false` flag
- Frontend shows "AI unavailable" subtle message, features still work manually
- Blocker detection falls back to keyword matching
- Commitment parsing falls back to treating entire text as single commitment

