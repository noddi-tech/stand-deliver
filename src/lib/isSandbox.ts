/**
 * Returns true when running in a Lovable preview/sandbox environment.
 * Explicitly excludes the published production domain.
 */
export function isSandbox(): boolean {
  const { hostname } = window.location;
  if (hostname === "standup-flow-app.lovable.app") return false;
  return hostname.includes("lovable.app") || hostname === "localhost";
}
