/**
 * Origins, ports and fixed e2e credentials for the cross-app suite.
 *
 * The suite runs the three apps it drives from one Playwright `webServer`
 * array on dedicated ports (3020–3022) so it never collides with a local
 * `next dev`, with another e2e job or with the per-app suites (which use
 * 3004–3009 and 3010/3011).
 *
 * ## Why two hostnames
 *
 * Cookies ignore ports: `asynchrone_session` set by the projects app on
 * `localhost:3021` and by the calendars app on `localhost:3022` would be the
 * *same* cookie and overwrite each other. Production separates the apps by
 * host (`projects.copilot.asynchrone.space` vs
 * `calendars.copilot.asynchrone.space`), so the suite does the same: projects
 * shares `localhost` with Copilot (different cookie name) and calendars runs
 * on the loopback IP. That keeps every app's session cookie host-only, which
 * is what the back-channel-logout spec asserts.
 */

export const E2E_COPILOT_PORT = Number(process.env.E2E_COPILOT_PORT ?? 3020)
export const E2E_PROJECTS_PORT = Number(process.env.E2E_PROJECTS_PORT ?? 3021)
export const E2E_CALENDARS_PORT = Number(process.env.E2E_CALENDARS_PORT ?? 3022)

export const E2E_COPILOT_URL =
  process.env.E2E_COPILOT_URL ?? `http://localhost:${E2E_COPILOT_PORT}`
export const E2E_PROJECTS_URL =
  process.env.E2E_PROJECTS_URL ?? `http://localhost:${E2E_PROJECTS_PORT}`
export const E2E_CALENDARS_URL =
  process.env.E2E_CALENDARS_URL ?? `http://127.0.0.1:${E2E_CALENDARS_PORT}`

/**
 * A configured but unreachable workspace app. The failure-injection spec
 * points a domain origin here to prove that one down app degrades the result
 * to `partial` instead of failing the request. Nothing ever listens on it.
 */
export const E2E_UNAVAILABLE_APP_URL =
  process.env.E2E_UNAVAILABLE_APP_URL ?? "http://127.0.0.1:3099"

/**
 * Copilot's client-credentials client. Mirrors
 * `apps/copilot/e2e/internal-domain.ts` (an app module this package cannot
 * import without an app→app dependency); `e2e/bootstrap.ts` spawns that app's
 * bootstrap so the row and these values cannot drift.
 */
export const E2E_COPILOT_OAUTH_CLIENT_ID = "asynchrone-copilot"
export const E2E_COPILOT_OAUTH_CLIENT_SECRET = "e2e-copilot-oauth-client-secret"

/**
 * The control-tower service client. The control tower is the only caller
 * allowed to create platform handoffs (`internal:identity:admin`), so the
 * impersonation spec mints a token with this client. Provisioned by
 * `apps/copilot/scripts/provision-cross-app-clients.ts` with the secret below.
 */
export const E2E_CONTROL_TOWER_OAUTH_CLIENT_ID = "asynchrone-control-tower"
export const E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET =
  "e2e-control-tower-oauth-client-secret"

/** Shared secret for the CronJob route the suite retries. */
export const E2E_CRON_SECRET = "e2e-cross-app-cron-secret"

/** Copilot pins the impersonation TTL; the spec asserts the same window. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000
