import * as Sentry from "@sentry/nextjs"

/**
 * Server and edge error tracking. Sentry stays off unless `SENTRY_DSN` is set,
 * so local development and CI need no account.
 */
export function register() {
  if (!process.env.SENTRY_DSN) return
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.DEPLOY_ENV ?? process.env.NODE_ENV,
    release: process.env.GIT_COMMIT_SHA || undefined,
    // Sampled request timings feed the p95 latency alert.
    tracesSampleRate: 0.1,
  })
}

export const onRequestError = Sentry.captureRequestError
