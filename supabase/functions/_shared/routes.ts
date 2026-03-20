export const ROUTES = {
  standup: "/standup",
  dashboard: "/dashboard",
  settings: "/settings",
} as const;

export function getSiteUrl(): string {
  return Deno.env.get("SITE_URL") || "https://standflow.naviosolutions.com";
}
