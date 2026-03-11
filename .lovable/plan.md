

## Problem: Events API Returns 0 Because Repos Are Private

The logs confirm the Events API is deployed and called, but returns 0 for every user:
```
Events API found 0 commits for ClickUpBotGOAT
Events API found 0 commits for mattisaa
Events API found 0 commits for stiangrim
...
```

The current code calls `GET /users/{username}/events` — this endpoint only returns **public** events. Since `noddi-tech` repos are private, it sees nothing.

## Fix

Use the **org-scoped events endpoint** instead: `GET /users/{username}/events/orgs/{org}`. This returns private org activity when authenticated with a token that has org access (which the PAT already has).

### Changes

**`supabase/functions/github-sync-activity/index.ts`**:
- Update `fetchUserEvents` to accept `orgName` parameter
- Change URL from `/users/${username}/events` to `/users/${username}/events/orgs/${orgName}`
- Pass `orgName` when calling the function (~line 305)

**`supabase/functions/github-fetch-activity/index.ts`**:
- Same change to `fetchUserEvents`

### Key code change:

```typescript
// Before (only public events):
`${GH_API}/users/${username}/events?per_page=100`

// After (includes private org events):
`${GH_API}/users/${username}/events/orgs/${orgName}?per_page=100`
```

The function signature changes from:
```typescript
fetchUserEvents(token, username, startDate, endDate)
```
to:
```typescript
fetchUserEvents(token, username, orgName, startDate, endDate)
```

This is a 2-line change per file. Everything else stays the same.

