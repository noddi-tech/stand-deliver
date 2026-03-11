
Goal: replace the hidden/dev-only impersonation flow with a visible one-click sandbox login button for Joachim Rathke.

What’s going wrong
- The current bypass is gated by `import.meta.env.DEV` in `src/hooks/useAuth.tsx`.
- Lovable preview/sandbox is not behaving like local Vite dev here, so that condition is false.
- Result: the app shows the normal `/auth` Slack page, and the impersonation UI never appears.
- Even if the flow exists, it is too manual for your use case: you want one button, not email + secret entry.

Implementation approach
1. Stop relying on `import.meta.env.DEV`
- Introduce a single “sandbox detection” rule based on the runtime hostname instead of Vite dev mode.
- Enable bypass only on preview URLs, and explicitly disable it on the published app domain.

2. Add a visible button on the Auth page
- On `src/pages/Auth.tsx`, keep the normal Slack sign-in.
- When running in sandbox/preview, also render:
  - “Continue as Joachim Rathke”
- Clicking it should directly trigger the impersonation flow, with Joachim’s known email prefilled in code.

3. Simplify the client impersonation UI
- Refactor `src/components/DevUserPicker.tsx` from a manual form into a small helper that can be used in two modes:
  - one-click preset for Joachim
  - optional advanced/manual mode only if needed later
- No secret input should be required for the Joachim sandbox button.

4. Adjust the edge function for sandbox-safe one-click login
- Update `supabase/functions/dev-impersonate/index.ts` so it supports:
  - sandbox preview origin + fixed allowed email (Joachim) without manual secret entry
  - existing secret-based path for broader/manual impersonation if you still want that as fallback
- Also tighten CORS/origin checks so this shortcut cannot be used from the published domain.

5. Leave real auth/session behavior intact
- Keep `src/hooks/useAuth.tsx` responsible for normal Supabase session hydration and auth state changes.
- Remove the logic that swaps the whole app into `DevUserPicker` mode based on `import.meta.env.DEV`.
- After successful impersonation, the app should behave like a normal signed-in session with real org/team/RLS access.

Files to update
- `src/hooks/useAuth.tsx`
  - remove preview-bypass rendering logic based on `import.meta.env.DEV`
  - keep only normal auth provider behavior
- `src/pages/Auth.tsx`
  - add sandbox-only “Continue as Joachim Rathke” button
  - wire it to the impersonation action
- `src/components/DevUserPicker.tsx`
  - simplify into reusable impersonation action UI/helper
  - preset Joachim flow; optional advanced fallback
- `supabase/functions/dev-impersonate/index.ts`
  - allow sandbox-origin one-click impersonation for Joachim
  - deny published domain
  - keep/manual secret path optional
- `supabase/config.toml`
  - likely no structural change needed if `dev-impersonate` is already registered

Technical details
- Known target user already exists:
  - Joachim Rathke
  - `joachim@noddi.no`
- Best gate for sandbox:
  - allow preview host pattern
  - deny `standup-flow-app.lovable.app`
- Best UX:
  - show button directly on `/auth`, because that is where you land now
- Security tradeoff:
  - one-click impersonation without entering a secret is only reasonable if it is restricted to sandbox preview origins and a fixed safe target account
  - it must not be available on the published app

Expected result
- In preview/sandbox, `/auth` shows a clear “Continue as Joachim Rathke” button.
- Clicking it signs you into a real Supabase session as Joachim.
- Because it is a real session, org/team membership and RLS-backed data work correctly.
- On the published app, only normal Slack login remains available.
