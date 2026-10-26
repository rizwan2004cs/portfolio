import * as Sentry from "@sentry/nextjs";

// Browser errors go to Sentry; nothing else (no performance tracing, no session replay) so the page stays light.
// Off unless the Vercel integration set the DSN, so local and CI runs report nothing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV === "production",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV,
  tracesSampleRate: 0,
  dataCollection: { userInfo: false, cookies: false },
});
