import path from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Scripts run outside Next, so nothing has loaded the env. Prefer the shared
 * repo env (`apps/copilot/.env`), then a control-tower-local `.env`.
 */
loadEnv({
  path: [path.resolve(here, "../../../apps/copilot/.env"), path.resolve(here, "../.env")],
  quiet: true,
})
