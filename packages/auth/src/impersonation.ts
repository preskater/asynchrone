/**
 * Impersonation sessions are capped independently of the customer app's normal
 * (7-day) session lifetime. The handoff cookie uses this TTL and the app layout
 * deletes the session once it is older, even if Better Auth refreshed it.
 */
export const IMPERSONATION_TTL_SECONDS = 60 * 60
export const IMPERSONATION_TTL_MS = IMPERSONATION_TTL_SECONDS * 1000
