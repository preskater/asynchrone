import { defineConfig } from "@playwright/test"

import {
  E2E_COPILOT_PORT,
  E2E_COPILOT_URL,
  E2E_CLIENTS_PORT,
  E2E_CLIENTS_URL,
  E2E_OAUTH_CLIENT_ID,
  E2E_OAUTH_CLIENT_SECRET,
} from "./e2e/env"

/**
 * The clients app depends on Copilot for sign-in, so the suite runs both
 * servers. `e2e/bootstrap.ts` provisions the OAuth client before Playwright
 * starts them (`npm run test:e2e` runs it first).
 *
 * CI runs both apps from production builds (the job builds them first):
 * `next dev` recompiles routes on demand, a cold compile during a test can
 * exceed the assertion timeouts, and the dev server is less stable under the
 * suite's concurrent sign-ins. Local runs keep the faster dev server.
 *
 * The database must already be migrated; the suite never creates schema.
 */
const isCi = Boolean(process.env.CI)

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  // Both specs sign in through Copilot; running them side by side makes the
  // dev/start servers compile and sign in concurrently under CI load.
  workers: isCi ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: E2E_CLIENTS_URL,
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_CLIENTS_URL
    ? undefined
    : [
        {
          command: isCi
            ? `npm run start --workspace=copilot -- --port ${E2E_COPILOT_PORT}`
            : `npm run dev --workspace=copilot -- --port ${E2E_COPILOT_PORT}`,
          url: `${E2E_COPILOT_URL}/api/health`,
          reuseExistingServer: !isCi,
          timeout: isCi ? 600_000 : 240_000,
          cwd: "../..",
          env: {
            BETTER_AUTH_URL: E2E_COPILOT_URL,
            COPILOT_APP_URL: E2E_COPILOT_URL,
            CLIENTS_APP_URL: E2E_CLIENTS_URL,
            // The suite creates many accounts from one IP.
            E2E_AUTH_RATE_LIMIT_DISABLED: "1",
          },
        },
        {
          command: isCi
            ? `npm run start --workspace=clients -- --port ${E2E_CLIENTS_PORT}`
            : "npm run dev --workspace=clients",
          url: `${E2E_CLIENTS_URL}/api/health`,
          reuseExistingServer: !isCi,
          timeout: isCi ? 600_000 : 240_000,
          cwd: "../..",
          env: {
            CLIENTS_APP_URL: E2E_CLIENTS_URL,
            COPILOT_APP_URL: E2E_COPILOT_URL,
            CLIENTS_OAUTH_CLIENT_ID: E2E_OAUTH_CLIENT_ID,
            CLIENTS_OAUTH_CLIENT_SECRET: E2E_OAUTH_CLIENT_SECRET,
          },
        },
      ],
})
