

## Diagnosis

Two issues:

### 1. RLS Policies Are Still RESTRICTIVE
The previous migration to fix policies from RESTRICTIVE to PERMISSIVE did not take effect. Every single policy across all tables still shows `Permissive: No`. This is why the INSERT on `organizations` fails — a RESTRICTIVE policy cannot grant access without a base PERMISSIVE policy.

**Fix**: Run a new migration that drops all existing policies and recreates them as PERMISSIVE (the Postgres default). This is the same fix as before, but needs to actually execute this time.

### 2. Auth Flow Is Correct
The flow of authenticate → callback → dashboard → ProtectedRoute redirects to /onboarding (because no org exists) is actually working as designed. The user authenticates with Slack first, then lands on onboarding. The real blocker is just the RLS violation preventing org creation.

### Migration

Single file: drop and recreate all policies across all 14 tables as PERMISSIVE, preserving the same USING/WITH CHECK expressions. Tables: `organizations`, `organization_members`, `teams`, `team_members`, `profiles`, `standup_sessions`, `standup_responses`, `commitments`, `commitment_history`, `blockers`, `focus_recommendations`, `slack_installations`, `slack_user_mappings`, `ai_weekly_digests`.

