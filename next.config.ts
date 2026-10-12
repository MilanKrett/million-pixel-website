import type { NextConfig } from "next";
import { analyticsConfig } from "./src/lib/analytics";

const isDev = process.env.NODE_ENV === "development";
const isHttps = (process.env.SITE_URL ?? "").startsWith("https://");
const origin = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};
// Wall pictures and direct uploads live in Supabase Storage in production.
const storage = origin(process.env.SUPABASE_URL);
const analytics = analyticsConfig()?.origin ?? null;
const turnstile = "https://challenges.cloudflare.com";
const list = (...items: (string | null | false)[]) => items.filter(Boolean).join(" ");

/**
 * Content Security Policy (spec section 12). Nothing may load from other
 * sites except the bot check (Turnstile), the storage and the optional
 * statistics; no plug-ins, no framing, forms only to this site. Inline
 * scripts must stay allowed: Next.js streams page data in inline scripts and
 * the prerendered pages cannot carry a per-request nonce. No user HTML is
 * ever rendered, so this does not open a hole for injected scripts.
 */
const csp = [
  "default-src 'self'",
  `script-src ${list("'self'", "'unsafe-inline'", isDev && "'unsafe-eval'", turnstile, analytics)}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${list("'self'", "data:", "blob:", storage)}`,
  "font-src 'self'",
  `connect-src ${list("'self'", storage, analytics, isDev && "ws:")}`,
  `frame-src ${turnstile}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isHttps && "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ...(isHttps ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Development only: lets you open the dev server from a phone on the same
  // Wi-Fi (http://<computer IP>:3000) to test touch zoom and panning.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  cacheLife: {
    // Public wall data (image version, rentals, counters). Short enough that
    // changes show up within a minute even without on-demand revalidation,
    // long enough (expire >= 5 min) to stay part of the prerendered page.
    wall: { stale: 30, revalidate: 30, expire: 3600 },
    // Site settings change rarely and are revalidated on save. stale >= 5 min
    // keeps them in the instant "App Shell" of every page.
    settings: { stale: 300, revalidate: 300, expire: 86400 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
