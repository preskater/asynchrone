import path from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"
import { defineConfig, env } from "prisma/config"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Local env lives in `apps/copilot/.env` (see AGENTS.md). A package-local `.env`
 * is accepted too, so `@workspace/db` can be used on its own. `dotenv` does
 * not override variables that are already set, so CI/Docker values win.
 */
loadEnv({
  path: [path.resolve(here, "../../apps/copilot/.env"), path.resolve(here, ".env")],
  quiet: true,
})

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
