/**
 * Ports and origins the employees e2e suite drives.
 *
 * Both apps run from Playwright's `webServer` array: Copilot on 3010 (so the
 * suite never collides with a local `next dev` on 3003/3000) and the employees
 * app on its documented dev port 3009. The OAuth client is provisioned by
 * `e2e/bootstrap.ts` with the credentials below, which is why they are fixed
 * instead of generated.
 */

export const E2E_COPILOT_PORT = Number(process.env.E2E_COPILOT_PORT ?? 3010)
export const E2E_EMPLOYEES_PORT = Number(process.env.E2E_EMPLOYEES_PORT ?? 3009)

export const E2E_COPILOT_URL =
  process.env.E2E_COPILOT_URL ?? `http://localhost:${E2E_COPILOT_PORT}`
export const E2E_EMPLOYEES_URL =
  process.env.E2E_EMPLOYEES_URL ?? `http://localhost:${E2E_EMPLOYEES_PORT}`

/** Fixed so the bootstrap and both servers agree without an env file. */
export const E2E_OAUTH_CLIENT_ID = "asynchrone-employees"
export const E2E_OAUTH_CLIENT_SECRET = "e2e-employees-oauth-client-secret"
