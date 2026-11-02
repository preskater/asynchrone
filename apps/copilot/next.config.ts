import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig, securityHeaders } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/db-identity",
    "@workspace/audit",
    "@workspace/contracts",
    "@workspace/files",
    "@workspace/messaging",
    "@workspace/portal",
    "@workspace/sagas",
    "@workspace/search",
    "@workspace/db-core",
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
  // The workspace is a signed-in product, not a marketing site: keep it out of
  // search indexes with both a header (for every response, including static
  // assets) and `app/robots.ts`. The landing at asynchrone.space is the only
  // indexable app.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ noindex: true }),
      },
    ]
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
