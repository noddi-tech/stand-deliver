

# Fix: /vis-explained redirecting to Dashboard

## Investigation
The route, import, and component are all correctly configured — identical to every other working route. The most likely cause is that you're testing on the **published URL** (`standup-flow-app.lovable.app`), where direct navigation to deep links may not have proper SPA fallback configured. When the server doesn't recognize `/vis-explained`, it serves the root, which resolves to `/` → redirect to `/dashboard`.

On the **preview URL**, Vite's dev server handles all routes correctly, so this should work there.

## Verification step
Before making any code changes: try navigating to `/vis-explained` by clicking a link within the app (e.g., the "Learn more" link in the VIS tooltip on Team Insights) rather than typing the URL directly. If that works, it confirms this is a server-side SPA routing issue on the published domain, not a code bug.

## If the route genuinely doesn't work on preview
The only code fix would be adding an error boundary, but the component is straightforward static content with no data fetching — it shouldn't error. No code changes are needed; the route configuration is correct.

