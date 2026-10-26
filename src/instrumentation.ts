import * as Sentry from "@sentry/nextjs";

// Server errors (routes, rendering, the agent API) go to Sentry: errors only, no tracing, no IP addresses.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production",
    environment: process.env.VERCEL_ENV,
    tracesSampleRate: 0,
    dataCollection: { userInfo: false, cookies: false },
  });
}

export const onRequestError = Sentry.captureRequestError;
