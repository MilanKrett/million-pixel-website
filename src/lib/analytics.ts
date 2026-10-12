/**
 * Visit statistics without cookies (spec section 11: Plausible or Umami).
 * Off unless configured; then one small script from the service is loaded.
 *
 *   ANALYTICS_PROVIDER=plausible   ANALYTICS_SITE_ID=your-domain.com
 *   ANALYTICS_PROVIDER=umami       ANALYTICS_SITE_ID=<website id>
 *   ANALYTICS_SCRIPT_URL=…         (optional: own server or a proxy)
 *
 * Imported by next.config.ts (for the Content Security Policy), so no "@/" imports here.
 */

export interface AnalyticsConfig {
  provider: "plausible" | "umami";
  src: string;
  /** Origin the script loads from and sends visits to. */
  origin: string;
  attributes: Record<string, string>;
}

const DEFAULT_SCRIPTS = {
  plausible: "https://plausible.io/js/script.js",
  umami: "https://cloud.umami.is/script.js",
} as const;

export function analyticsConfig(env: Record<string, string | undefined> = process.env): AnalyticsConfig | null {
  const provider = env.ANALYTICS_PROVIDER;
  const siteId = env.ANALYTICS_SITE_ID?.trim();
  if ((provider !== "plausible" && provider !== "umami") || !siteId) return null;
  const src = env.ANALYTICS_SCRIPT_URL?.trim() || DEFAULT_SCRIPTS[provider];
  let origin: string;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    origin = url.origin;
  } catch {
    return null;
  }
  const attributes: Record<string, string> = provider === "plausible" ? { "data-domain": siteId } : { "data-website-id": siteId };
  return { provider, src, origin, attributes };
}
