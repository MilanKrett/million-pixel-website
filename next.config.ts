import type { NextConfig } from "next";

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
};

export default nextConfig;
