

## Replace Recent Activity with AI-Powered Focus Suggestions

### Problem
The "Recent Activity" section on My Standup shows raw GitHub commits and ClickUp events, but these are already completed work — not actionable focus items. Users see noise rather than guidance.

### Approach
Replace the Recent Activity section with an **AI Focus Suggestions** card that analyzes the user's recent activity, completed commitments, open blockers, and carry-over patterns to suggest what to focus on today. Each suggestion has an "Add" button to instantly add it as a today's focus item.

### Changes

#### 1. New edge function: `ai-suggest-focus`
Accepts `member_id` and `team_id`. Gathers context:
- Recent external activity (last 7 days: commits, PRs, ClickUp tasks)
- Previous commitments and their statuses (done, carried, blocked)
- Open blockers
- Carry-over patterns

Sends this context to the AI Gateway with a prompt asking for 3-5 actionable, specific focus suggestions with priorities. Returns structured JSON via tool calling.

#### 2. Replace Recent Activity UI in `MyStandup.tsx`
- Remove the `externalActivity` query, `acknowledgeActivity`, and `addActivityToStandup` logic
- Remove the Recent Activity card (lines 766-830)
- Add a new "Suggested Focus" card in its place that:
  - Calls the new edge function on load (with stale caching)
  - Shows AI-generated suggestions with a Sparkles icon
  - Each suggestion has an "Add to Focus" button that adds it to `todayCommitments`
  - Shows a loading skeleton while AI processes
  - Gracefully handles errors (hidden, no blocker)
  - Only shows when the user hasn't submitted yet and isn't editing

#### 3. Keep external activity acknowledgment
The raw activity items still need to be marked as acknowledged so they don't pile up. Auto-acknowledge them when the user submits their standup (batch update in `handleSubmit`).

### Edge function response shape
```json
{
  "suggestions": [
    {
      "title": "Follow up on PR #42 review comments",
      "reason": "You opened this PR yesterday and it has pending reviews",
      "priority": "high"
    },
    {
      "title": "Continue work on user search API",
      "reason": "Carried over twice — breaking it into smaller tasks may help",
      "priority": "medium"  
    }
  ]
}
```

### Summary
- **New file**: `supabase/functions/ai-suggest-focus/index.ts`
- **Edit**: `src/pages/MyStandup.tsx` — replace Recent Activity with AI suggestions card, auto-acknowledge activity on submit
- **Deploy**: the new edge function

