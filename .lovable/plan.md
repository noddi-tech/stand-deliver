

## Sandbox Auth Bypass

Add a dev-mode bypass so the preview/sandbox skips Slack OAuth and uses a mock user. This only activates when `import.meta.env.DEV` is true (Vite dev mode), so production is never affected.

### Changes

**`src/hooks/useAuth.tsx`**:
- At the top of `AuthProvider`, detect `import.meta.env.DEV`
- If dev mode, skip Supabase auth entirely and provide a mock user/session with a fixed UUID
- `signInWithSlack` becomes a no-op, `signOut` clears the mock

**`src/hooks/useOnboardingStatus.ts`**:
- In dev mode, return `{ hasOrg: true, hasTeam: true, orgId: "dev-org", teamId: "dev-team", loading: false }` to skip onboarding redirect

**`src/pages/Auth.tsx`**:
- In dev mode, auto-redirect to `/dashboard` immediately

This is a lightweight approach: three small `if (import.meta.env.DEV)` guards. No new files needed. Vite tree-shakes all dev-only code from production builds.

