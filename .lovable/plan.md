

## Two Fixes + Audio Recording Plan

### Fix 1: ClickUp User Mapping RLS Policy

**Problem**: The INSERT policy on `clickup_user_mappings` requires `user_id = auth.uid()`, so an admin can't map other team members.

**Fix**: Migration to drop and recreate the INSERT policy to only check `is_org_member(auth.uid(), org_id)` (removing the `user_id = auth.uid()` check). This matches how `slack_user_mappings` works.

| File | Change |
|------|--------|
| New migration | Drop old INSERT policy, create new one with `is_org_member(auth.uid(), org_id)` only |

### Fix 2: Duplicate Key Error on `standup_responses`

**Problem**: The conditional insert/update logic (lines 472-487) can fail when `existingResponseId` is stale or not set correctly, causing a duplicate insert on the `(session_id, member_id)` unique constraint.

**Fix**: Replace the conditional insert/update with a single `upsert` call using `onConflict: "session_id,member_id"`. This makes it idempotent.

| File | Change |
|------|--------|
| `src/pages/MyStandup.tsx` | Replace lines 472-487 with a single `.upsert({ session_id, member_id, ...responseData }, { onConflict: "session_id,member_id" })` |

---

### Audio Recording Feature (Plan Only — Not Implementing Now)

A new feature allowing teams to record standup meetings via browser audio, transcribe them with AI (supporting Norwegian), and auto-generate standup summaries.

**How it works:**

1. **Recording UI** (MeetingMode or new "Record Standup" page):
   - Start/stop button using the browser `MediaRecorder` API with `getUserMedia({ audio: true })`
   - Records as WebM/Opus (best browser support) or WAV
   - Shows live recording indicator with elapsed time
   - On stop, uploads the audio file to a Supabase Storage bucket (`standup-recordings`)

2. **Transcription Edge Function** (`ai-transcribe-standup`):
   - Downloads the audio from Storage
   - Sends it to OpenAI Whisper API (`POST /v1/audio/transcriptions`) with `language: "no"` for Norwegian
   - Returns the full transcript with timestamps
   - Requires an `OPENAI_API_KEY` secret (Whisper is not available via Lovable AI Gateway)

3. **AI Summary Edge Function** (`ai-summarize-recording`):
   - Takes the transcript text
   - Uses the Lovable AI Gateway to extract per-person standup data:
     - What they did yesterday
     - What they're doing today
     - Blockers
   - Speaker diarization: either rely on Whisper's basic segmentation, or ask users to state their name before speaking
   - Returns structured data that can populate standup responses

4. **Auto-fill Flow**:
   - After transcription + summarization, show the extracted data for review
   - Each team member's section is editable before confirming
   - On confirm, creates `standup_responses` and `commitments` for each identified member

**Data model additions:**
- Supabase Storage bucket: `standup-recordings` (private, RLS by team)
- New column on `standup_sessions`: `recording_url text` (optional)
- New column on `standup_sessions`: `transcript text` (optional)

**Required secrets:**
- `OPENAI_API_KEY` — for Whisper transcription (Norwegian support)

**Key considerations:**
- Norwegian language: Whisper has good Norwegian (Bokmål/Nynorsk) support with `language: "no"`
- Audio file size: a 15-min standup ≈ 5-10MB in WebM/Opus, well within Supabase Storage limits
- Speaker identification: simplest approach is to have each person say their name; more advanced would require a diarization model
- Privacy: recordings should be auto-deleted after transcription (configurable retention)

**Files that would be created/edited:**

| File | Change |
|------|--------|
| New migration | Add `recording_url` and `transcript` columns to `standup_sessions`, create storage bucket |
| New `supabase/functions/ai-transcribe-standup/index.ts` | Whisper transcription with Norwegian |
| New `supabase/functions/ai-summarize-recording/index.ts` | Extract per-person standup data from transcript |
| New `src/components/meeting/AudioRecorder.tsx` | Recording UI with MediaRecorder API |
| `src/pages/MeetingMode.tsx` | Integrate audio recorder + transcript review |

