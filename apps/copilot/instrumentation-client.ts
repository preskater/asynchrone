import * as Sentry from "@sentry/nextjs"

// Inlined at build time from SENTRY_DSN by next.config.ts.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1 })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
