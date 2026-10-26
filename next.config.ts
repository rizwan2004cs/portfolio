import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // e2e builds into its own folder (NEXT_DIST_DIR=.next-e2e) so tests never clobber a running local server
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/classic", destination: "/", permanent: true },
      // one address for every page: www would otherwise be a second copy of the whole site
      { source: "/:path*", has: [{ type: "host", value: "www.mohammad-rizwan.tech" }], destination: "https://mohammad-rizwan.tech/:path*", permanent: true },
    ];
  },
};

// With the Sentry auth token (set on Vercel by the integration) the build uploads source maps, so stack traces
// point at the real source; without it (local, CI) the config is left exactly as it is.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, { org: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT, authToken: process.env.SENTRY_AUTH_TOKEN, silent: true, telemetry: false })
  : nextConfig;
