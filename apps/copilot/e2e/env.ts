/**
 * Shared by `playwright.config.ts` and the specs.
 *
 * Both the app and the browser context must agree on one origin: Better Auth
 * rejects sign-up / organization requests whose `Origin` header does not match
 * `BETTER_AUTH_URL`, so the config exports this value to the dev server and
 * `fixtures.ts` sends it as the `Origin` header.
 */

/** Dedicated port so the suite never collides with another app on :3000. */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3010)

/** Origin the suite drives. Override to reuse an already running server. */
export const E2E_BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`
