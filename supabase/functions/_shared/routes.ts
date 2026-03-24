export const ROUTES = {
  standup: "/standup",
  dashboard: "/dashboard",
  settings: "/settings",
} as const;

/**
 * Returns the site origin (scheme + host), stripping any pathname/query/hash.
 * Resilient to SITE_URL being set with a trailing path like "/settings".
 */
export function getSiteUrl(): string {
  const raw = Deno.env.get("SITE_URL") || "https://standflow.naviosolutions.com";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://standflow.naviosolutions.com";
  }
}

/**
 * Builds a full app URL for a given route, ensuring no double slashes or stale paths.
 */
export function buildAppUrl(route: string): string {
  const origin = getSiteUrl();
  const cleanRoute = route.startsWith("/") ? route : `/${route}`;
  return `${origin}${cleanRoute}`;
}
