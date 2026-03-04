

# Replace Magic Link with Slack OIDC Auth

Two files to update, no database changes needed.

## 1. `src/hooks/useAuth.tsx`
- Replace `signInWithMagicLink` with `signInWithSlack` in the interface and implementation
- Use `supabase.auth.signInWithOAuth({ provider: 'slack_oidc', options: { redirectTo: window.location.origin } })`

## 2. `src/pages/Auth.tsx`
- Remove email input, sent state, and magic link form
- Replace with a single "Sign in with Slack" button that calls `signInWithSlack()`
- Keep loading spinner and redirect-if-authenticated logic
- Add Slack icon (from lucide or inline SVG)

