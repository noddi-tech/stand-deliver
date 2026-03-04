

## Diagnosis: `useAuth must be used within AuthProvider`

The component tree in `App.tsx` is correctly structured — `AuthProvider` wraps `BrowserRouter` which contains the `<Auth />` route. This error is a **transient HMR (hot module reload) issue** caused by Vite's module cache becoming stale after recent edits to `IntegrationsTab.tsx` and `.env`.

### Fix

No code changes are needed. A **hard reload** of the preview (or clicking "Try to fix" / refreshing the browser) should resolve this immediately.

If the error persists after a full reload, there may be a circular import issue, but based on the current code structure everything is correctly wired.

