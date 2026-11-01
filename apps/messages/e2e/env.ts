/**
 * Ports and origins the messages e2e suite drives.
 *
 * Both apps run from Playwright's `webServer` array: Copilot on 3011 (so the
 * suite never collides with a local `next dev` on 3003/3010) and the messages
 * app on its documented dev port 3007. The OAuth client is provisioned by
 * `e2e/bootstrap.ts` with the credentials below, which is why they are fixed
 * instead of generated.
 */

export const E2E_COPILOT_PORT = Number(process.env.E2E_COPILOT_PORT ?? 3011)
export const E2E_MESSAGES_PORT = Number(process.env.E2E_MESSAGES_PORT ?? 3007)

export const E2E_COPILOT_URL =
  process.env.E2E_COPILOT_URL ?? `http://localhost:${E2E_COPILOT_PORT}`
export const E2E_MESSAGES_URL =
  process.env.E2E_MESSAGES_URL ?? `http://localhost:${E2E_MESSAGES_PORT}`

/** Fixed so the bootstrap and both servers agree without an env file. */
export const E2E_OAUTH_CLIENT_ID = "asynchrone-messages"
export const E2E_OAUTH_CLIENT_SECRET = "e2e-messages-oauth-client-secret"
