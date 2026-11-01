/**
 * Ports and origins the calendars e2e suite drives.
 *
 * Both apps run from Playwright's `webServer` array: Copilot on 3010 (so the
 * suite never collides with a local `next dev` on 3003/3000) and the calendars
 * app on its documented dev port 3005. The OAuth client is provisioned by
 * `e2e/bootstrap.ts` with the credentials below, which is why they are fixed
 * instead of generated.
 */

export const E2E_COPILOT_PORT = Number(process.env.E2E_COPILOT_PORT ?? 3010)
export const E2E_CALENDARS_PORT = Number(process.env.E2E_CALENDARS_PORT ?? 3005)

export const E2E_COPILOT_URL =
  process.env.E2E_COPILOT_URL ?? `http://localhost:${E2E_COPILOT_PORT}`
export const E2E_CALENDARS_URL =
  process.env.E2E_CALENDARS_URL ?? `http://localhost:${E2E_CALENDARS_PORT}`

/** Fixed so the bootstrap and both servers agree without an env file. */
export const E2E_OAUTH_CLIENT_ID = "asynchrone-calendars"
export const E2E_OAUTH_CLIENT_SECRET = "e2e-calendars-oauth-client-secret"
