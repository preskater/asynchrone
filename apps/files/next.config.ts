import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * The files domain app.
 *
 * It owns `/{locale}/{orgSlug}/files`, the chunked upload API, the download
 * endpoint and the `uploads-sweep` cron on its own host. It signs in through
 * Copilot with `@workspace/oidc` and stores bytes as PostgreSQL large objects.
 * See `docs/domain-app-template.md`.
 */
export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/audit",
    "@workspace/contracts",
    "@workspace/db",
    "@workspace/db-core",
    "@workspace/files",
    "@workspace/oidc",
    "@workspace/storage",
  ],
  // `pg` and `pg-large-object` are native/CommonJS; keep them external so the
  // server bundle loads them at runtime instead of trying to bundle them.
  serverExternalPackages: ["pg-large-object", "pg"],
  experimental: {
    globalNotFound: true,
  },
})
