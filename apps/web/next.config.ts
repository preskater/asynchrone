import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/db",
    "@workspace/audit",
    "@workspace/contracts",
    "@workspace/files",
    "@workspace/sagas",
    "@workspace/search",
    "@workspace/db-core",
    "@workspace/db-identity",
    "@workspace/service-auth",
    "@workspace/projects",
    "@workspace/clients",
    "@workspace/employees",
  ],
  // `pg-large-object` is CommonJS with native `pg` bindings; keep it external
  // so the server bundle loads it at runtime instead of trying to bundle it.
  serverExternalPackages: ["pg-large-object", "pg"],
  experimental: {
    globalNotFound: true,
  },
  async redirects() {
    return [
      {
        // Time & attendance became Employees (#147). Keep old bookmarks working; the locale
        // prefix is always present because the app uses `localePrefix: "always"`.
        source: "/:locale/:orgSlug/hr",
        destination: "/:locale/:orgSlug/employees",
        permanent: true,
      },
    ]
  },
})
