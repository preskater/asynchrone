import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * The projects domain app.
 *
 * It owns `/{locale}/{orgSlug}/projects` on its own host, signs in through
 * Copilot with `@workspace/oidc`, and loads its data from its own database
 * client. See `docs/domain-app-template.md`.
 */
export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/audit",
    "@workspace/contracts",
    "@workspace/db-projects",
    "@workspace/db-core",
    "@workspace/integrations",
    "@workspace/notifications",
    "@workspace/oidc",
    "@workspace/realtime",
    "@workspace/projects",
  ],
  // `pg` and `pg-large-object` are native/CommonJS; keep them external so the
  // server bundle loads them at runtime instead of trying to bundle them.
  serverExternalPackages: ["pg-large-object", "pg"],
  experimental: {
    globalNotFound: true,
  },
})
