import path from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"
import { defineConfig } from "prisma/config"

const here = path.dirname(fileURLToPath(import.meta.url))

loadEnv({
  path: [path.resolve(here, "../../apps/copilot/.env"), path.resolve(here, ".env")],
  quiet: true,
})

const url = process.env.PROJECTS_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) throw new Error("PROJECTS_DATABASE_URL or DATABASE_URL is required")

const shadow =
  process.env.PROJECTS_SHADOW_DATABASE_URL ??
  (() => {
    const parsed = new URL(url)
    parsed.pathname = parsed.pathname + "_shadow"
    return parsed.toString()
  })()

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url, shadowDatabaseUrl: shadow },
})
