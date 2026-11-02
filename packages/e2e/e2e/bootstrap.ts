/**
 * Provision everything the cross-app suite needs before Playwright starts.
 *
 * The suite reuses the apps' own e2e bootstraps instead of restating their
 * clients: `apps/copilot/e2e/bootstrap.ts` writes Copilot's client-credentials
 * client, `apps/projects/e2e/bootstrap.ts` and `apps/calendars/e2e/bootstrap.ts`
 * write the two relying parties. Because a workspace package may not import an
 * app, they run as child processes with the origins of this suite (the suites
 * derive their redirect URIs from `*_APP_URL`, so the same client rows serve
 * ports 3020–3022).
 *
 * `apps/copilot/scripts/provision-cross-app-clients.ts` then closes the three
 * gaps the per-app bootstraps leave:
 *
 * 1. resource rows carry the union of user and service scopes (each bootstrap
 *    writes only its own half, and whichever ran last would unset the other);
 * 2. Copilot's service client reaches the calendars audience;
 * 3. the control-tower service client exists — the only caller allowed to
 *    create a platform handoff.
 *
 * Run with `npm run test:e2e --workspace=@workspace/e2e` (the script chain
 * runs this first).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { config } from "dotenv"

import {
  E2E_CALENDARS_URL,
  E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
  E2E_COPILOT_URL,
  E2E_PROJECTS_URL,
} from "./env"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

// Local runs pick up the same settings as the app suites; CI already has the
// variables in the environment and exported values always win.
const envFile = resolve(root, "apps/copilot/.env")
if (existsSync(envFile)) {
  config({ path: envFile, quiet: true })
}

function run(script: string, extraEnv: Record<string, string> = {}): void {
  const result = spawnSync(
    resolve(root, "node_modules/.bin/tsx"),
    [resolve(root, script)],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
      timeout: 120_000,
    }
  )
  if (result.status !== 0) {
    throw new Error(`[cross-app e2e] ${script} exited ${result.status}`)
  }
}

run("apps/copilot/e2e/bootstrap.ts")
run("apps/projects/e2e/bootstrap.ts", {
  E2E_COPILOT_URL,
  E2E_PROJECTS_URL,
})
run("apps/calendars/e2e/bootstrap.ts", {
  E2E_COPILOT_URL,
  E2E_CALENDARS_URL,
})
run("apps/copilot/scripts/provision-cross-app-clients.ts", {
  E2E_CALENDARS_URL,
  E2E_CONTROL_TOWER_OAUTH_CLIENT_SECRET,
})

console.log("[cross-app e2e] OAuth clients provisioned")
