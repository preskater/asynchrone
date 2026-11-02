import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * The calendars domain app.
 *
 * It owns `/{locale}/{orgSlug}/calendars` (and the meeting inbox/settings) on
 * its own host, signs in through Copilot with `@workspace/oidc`, and loads its
 * data from its own database client. See `docs/domain-app-template.md`.
 */
export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/audit",
    "@workspace/calendars",
    "@workspace/contracts",
    "@workspace/db-calendars",
    "@workspace/db-core",
    "@workspace/meetings",
    "@workspace/notifications",
    "@workspace/oidc",
    "@workspace/projects",
  ],
  // `pg` and `pg-large-object` are native/CommonJS; keep them external so the
  // server bundle loads them at runtime instead of trying to bundle them.
  serverExternalPackages: ["pg-large-object", "pg"],
  experimental: {
    globalNotFound: true,
  },
})
