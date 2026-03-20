

# Three Surgical Fixes

## 1. Fix all Slack URLs to prevent 404s

**Problem:** The `SITE_URL` secret and `_shared/routes.ts` fallback may point to the old Lovable preview domain instead of the production domain (`standflow.naviosolutions.com`). Also, any hardcoded or stale URLs in edge functions would cause 404s.

**Fix:**
- **`supabase/functions/_shared/routes.ts`** — Update the fallback URL from `https://standup-flow-app.lovable.app` to the production domain
- **Verify `SITE_URL` secret** is set to `https://standflow.naviosolutions.com` (per memory, it should already be)
- **`src/App.tsx`** — Add a redirect route `<Route path="/my-standup" element={<Navigate to="/standup" replace />} />` as a safety net for any old bookmarks or cached Slack messages (this is a one-liner that prevents 404s for legacy links — not a feature, just a redirect)

Files: `supabase/functions/_shared/routes.ts`, `src/App.tsx`

---

## 2. Require minimum 2 focus items on standup submission

**Problem:** Users can submit with just 1 focus item, which is too high-level for accountability.

**Fix in `src/pages/MyStandup.tsx`:**
- Change validation in `handleSubmit` and `requestCoachReview` from `todayCommitments.length === 0` to `todayCommitments.length < 2`
- Update error message to: `"Add at least 2 focus items to keep your standup actionable"`
- Show a helper hint near the focus input when there are 0-1 items

File: `src/pages/MyStandup.tsx`

---

## 3. Hourly follow-up reminders with public escalation after 3rd

**Problem:** Members who miss the initial reminder get no follow-up. No accountability mechanism.

**Design:**
- Create a new edge function `slack-followup-cron` that runs every hour (via pg_cron)
- For each team with an active session today, check which members have NOT submitted a response
- Track reminder count per member per day in a new `standup_reminders` table
- Send DM reminders (1st and 2nd) with escalating urgency
- On the 3rd reminder, post a message to the team's `slack_channel_id` naming the missing members publicly

**Changes:**
1. **New migration** — Create `standup_reminders` table: `id, team_id, member_id, session_date, reminder_count, last_sent_at`
2. **New edge function `slack-followup-cron`** — Runs hourly, queries members without responses, increments reminder count, sends DM or channel post
3. **`supabase/config.toml`** — Add `[functions.slack-followup-cron]` with `verify_jwt = false`
4. **New pg_cron job** — Schedule hourly invocation (separate SQL insert, not a migration)

| Reminder # | Action | Message tone |
|-----------|--------|-------------|
| 1 | DM | "Friendly nudge — standup is waiting" |
| 2 | DM | "Second reminder — please submit your standup" |
| 3+ | Post to #standup channel | "⚠️ @Member still hasn't posted their standup today" |

