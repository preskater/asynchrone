import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig } from "@playwright/test"
import { config as loadEnv } from "dotenv"

import {
  E2E_CALENDARS_URL,
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_COPILOT_URL,
  E2E_CRON_SECRET,
  E2E_PROJECTS_URL,
} from "./e2e/env"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

// Local runs share the app suite's settings (DATABASE_URL, BETTER_AUTH_SECRET,
// …). CI provides them in the job environment; exported values always win.
const envFile = resolve(repoRoot, "apps/copilot/.env")
if (existsSync(envFile)) loadEnv({ path: envFile, quiet: true })

// The identity tables still live in the monolith database (the database split
// is a maintenance operation, #185/#171): Copilot's Better Auth session writes
// through `@workspace/db` while its admin and saga stores read
// `IDENTITY_DATABASE_URL` first. Point both at the same database so the specs,
// the probe and the apps agree on one set of rows.
if (process.env.DATABASE_URL) {
  process.env.IDENTITY_DATABASE_URL = process.env.DATABASE_URL
}

// CI runs the apps from their production builds: `next dev` compiles routes on
// demand, and a cold compile during a spec can reset a streaming response.
// Local runs keep the faster dev server and may reuse one already running.
const isCi = Boolean(process.env.CI)
const reuseExistingServer = !isCi
const serverTimeout = isCi ? 300_000 : 240_000

function command(app: string, port: number): string {
  return isCi
    ? `npm run start --workspace=${app} -- --port ${port}`
    : `npm run dev --workspace=${app} -- --port ${port}`
}

const sharedCopilotEnv = {
  BETTER_AUTH_URL: E2E_COPILOT_URL,
  COPILOT_APP_URL: E2E_COPILOT_URL,
  COPILOT_OAUTH_CLIENT_ID: E2E_COPILOT_OAUTH_CLIENT_ID,
  COPILOT_OAUTH_CLIENT_SECRET: E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_AUTH_RATE_LIMIT_DISABLED: "1",
  CRON_SECRET: E2E_CRON_SECRET,
  // The handoff route builds its link from PLATFORM_APP_URL; stopping an
  // impersonation redirects to the control tower, which this suite does not
  // boot (`Stop impersonating` is asserted through the API response).
  PLATFORM_APP_URL: E2E_COPILOT_URL,
  CONTROL_TOWER_URL: "http://127.0.0.1:3098",
}

/**
 * Cross-app OIDC and domain end-to-end suite (#210).
 *
 * Three servers, three hosts: Copilot owns the session and the OAuth server,
 * projects and calendars are relying parties with a host-only session
 * (`docs/oidc-client.md`). `e2e/bootstrap.ts` provisions the OAuth clients
 * before Playwright starts; the databases must already be migrated.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 180_000,
  fullyParallel: false,
  // The specs share one identity database and provision accounts; one worker
  // keeps port, cookie and fixture writes deterministic.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: E2E_COPILOT_URL,
    trace: "on-first-retry",
  },
  // A local run uses `next dev`, which compiles a route on first request; the
  // default 5s assertion budget is shorter than a cold compile.
  expect: { timeout: 20_000 },
  webServer:
    process.env.E2E_CROSS_APP_EXTERNAL === "1"
      ? undefined
      : [
          {
            command: command("copilot", 3020),
            url: `${E2E_COPILOT_URL}/api/health`,
            reuseExistingServer,
            timeout: serverTimeout,
            cwd: repoRoot,
            env: {
              ...sharedCopilotEnv,
              // Only the apps this suite drives are configured. A down app is
              // injected per probe (see e2e/failure.spec.ts) so the browser
              // cases never depend on another host being reachable.
              PROJECTS_APP_URL: E2E_PROJECTS_URL,
              CALENDARS_APP_URL: E2E_CALENDARS_URL,
            },
          },
          {
            command: command("projects", 3021),
            url: `${E2E_PROJECTS_URL}/api/health`,
            reuseExistingServer,
            timeout: serverTimeout,
            cwd: repoRoot,
            env: {
              PROJECTS_APP_URL: E2E_PROJECTS_URL,
              COPILOT_APP_URL: E2E_COPILOT_URL,
              PROJECTS_OAUTH_CLIENT_ID: "asynchrone-projects",
              PROJECTS_OAUTH_CLIENT_SECRET: "e2e-projects-oauth-client-secret",
            },
          },
          {
            command: command("calendars", 3022),
            url: `${E2E_CALENDARS_URL}/api/health`,
            reuseExistingServer,
            timeout: serverTimeout,
            cwd: repoRoot,
            env: {
              CALENDARS_APP_URL: E2E_CALENDARS_URL,
              COPILOT_APP_URL: E2E_COPILOT_URL,
              CALENDARS_OAUTH_CLIENT_ID: "asynchrone-calendars",
              CALENDARS_OAUTH_CLIENT_SECRET:
                "e2e-calendars-oauth-client-secret",
            },
          },
        ],
})
