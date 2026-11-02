import "dotenv/config"

import { defineConfig } from "@playwright/test"

import { E2E_BASE_URL, E2E_PORT } from "./e2e/env"
import {
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_DOMAIN_APPS,
  domainEnvironment,
} from "./e2e/internal-domain"

// CI runs the app from a production build: `next dev` recompiles routes on
// demand, and a cold compile during a test can trigger an HMR reload while the
// page is still streaming. Local runs keep the faster dev server.
const isCi = Boolean(process.env.CI)
const reuseExistingServer = !isCi

const domainAppUrls = Object.fromEntries(
  E2E_DOMAIN_APPS.map((app) => [
    `${app.key.toUpperCase()}_APP_URL`,
    `http://localhost:${app.port}`,
  ])
)

const copilotEnv = {
  BETTER_AUTH_URL: E2E_BASE_URL,
  E2E_AUTH_RATE_LIMIT_DISABLED: "1",
  COPILOT_APP_URL: E2E_BASE_URL,
  COPILOT_OAUTH_CLIENT_ID: E2E_COPILOT_OAUTH_CLIENT_ID,
  COPILOT_OAUTH_CLIENT_SECRET: E2E_COPILOT_OAUTH_CLIENT_SECRET,
  ...domainAppUrls,
}

const domainServers = E2E_DOMAIN_APPS.map((app) => ({
  command: `npm run dev --workspace=${app.key}`,
  url: `http://localhost:${app.port}/api/health`,
  reuseExistingServer,
  timeout: isCi ? 300_000 : 180_000,
  env: {
    ...copilotEnv,
    ...domainEnvironment(E2E_BASE_URL, app),
  },
}))

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
    : [
        {
          command: isCi
            ? `npm run build && npm run start -- --port ${E2E_PORT}`
            : `npm run dev -- --port ${E2E_PORT}`,
          url: E2E_BASE_URL,
          reuseExistingServer,
          timeout: isCi ? 600_000 : 180_000,
          env: copilotEnv,
        },
        // The assistant, MCP tools and portal resolve domain data over the
        // internal APIs, so the owning apps run alongside Copilot.
        ...domainServers,
      ],
})
