

## Edit Daily Standup

### Problem

Currently, once a standup is submitted:
- The "Edit" button just resets the form to blank — it doesn't reload the submitted data
- The `standup_responses` table has no UPDATE RLS policy, so edits can't be saved
- Commitments already inserted can't be modified after submission

### What changes

When a user visits My Standup and has already submitted today, they see their response in a read-only summary with an "Edit" button. Clicking Edit loads their submitted data back into the form for modification. On re-submit, the existing response and commitments are updated rather than duplicated.

### Plan

**1. Database: Add UPDATE policy on `standup_responses`**

Allow members to update their own responses:
```sql
CREATE POLICY "Members can update own responses"
ON public.standup_responses FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM team_members tm
  WHERE tm.id = standup_responses.member_id AND tm.user_id = auth.uid()
));
```

**2. MyStandup.tsx: Detect existing submission and enable editing**

- On load, query `standup_responses` for today's session + current member
- If found, show the read-only summary view (like current post-submit) with the real data from DB
- "Edit" button loads the response data (mood, blockers, notes, today_text) back into form state
- Also load today's commitments from `commitments` table for this session
- On re-submit: UPDATE the existing `standup_responses` row instead of INSERT, and update/replace commitments

**3. Commitment editing on re-submit**

- Fetch commitments created in today's session by this member
- Allow removing, editing, or adding new ones
- On save: delete removed commitments (needs DELETE or mark as dropped), update existing titles, insert new ones

Since commitments can't be deleted (no DELETE RLS), dropped commitments will be marked `status = 'dropped'` and new ones inserted.

### Files Changed

| File | Change |
|------|--------|
| New migration | Add UPDATE policy on `standup_responses` |
| `src/pages/MyStandup.tsx` | Detect existing response, load data for editing, update on re-submit instead of insert |

