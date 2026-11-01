import { defineConfig } from "@playwright/test"

import { E2E_BASE_URL, E2E_PORT } from "./e2e/env"

export default defineConfig({
  testDir: "./e2e",
  // `next dev` compiles routes on demand, so a cold run is much slower than a
  // warm one; the a11y spec alone visits seven routes in a single test.
  timeout: 120_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${E2E_PORT}`,
        url: E2E_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        // `.env` pins BETTER_AUTH_URL to :3000; point it at the port we serve
        // on so the Origin header from `fixtures.ts` passes the CSRF check.
        env: { BETTER_AUTH_URL: E2E_BASE_URL },
      },
})
