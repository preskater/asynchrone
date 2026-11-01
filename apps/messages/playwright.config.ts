import { defineConfig } from "@playwright/test"

import {
  E2E_COPILOT_PORT,
  E2E_COPILOT_URL,
  E2E_MESSAGES_PORT,
  E2E_MESSAGES_URL,
  E2E_OAUTH_CLIENT_ID,
  E2E_OAUTH_CLIENT_SECRET,
} from "./e2e/env"

/**
 * The messages app depends on Copilot for sign-in, so the suite runs both
 * servers. `e2e/bootstrap.ts` provisions the OAuth client before Playwright
 * starts them (`npm run test:e2e` runs it first).
 *
 * The database must already be migrated; the suite never creates schema.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: E2E_MESSAGES_URL,
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_MESSAGES_URL
    ? undefined
    : [
        {
          command: `npm run dev --workspace=copilot -- --port ${E2E_COPILOT_PORT}`,
          url: `${E2E_COPILOT_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          cwd: "../..",
          env: {
            BETTER_AUTH_URL: E2E_COPILOT_URL,
            COPILOT_APP_URL: E2E_COPILOT_URL,
            MESSAGES_APP_URL: E2E_MESSAGES_URL,
            PROJECTS_APP_URL:
              process.env.PROJECTS_APP_URL ?? "http://localhost:3004",
          },
        },
        {
          command: `npm run dev --workspace=messages -- --port ${E2E_MESSAGES_PORT}`,
          url: `${E2E_MESSAGES_URL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          cwd: "../..",
          env: {
            MESSAGES_APP_URL: E2E_MESSAGES_URL,
            COPILOT_APP_URL: E2E_COPILOT_URL,
            MESSAGES_OAUTH_CLIENT_ID: E2E_OAUTH_CLIENT_ID,
            MESSAGES_OAUTH_CLIENT_SECRET: E2E_OAUTH_CLIENT_SECRET,
          },
        },
      ],
})
