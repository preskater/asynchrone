import path from "node:path"
import { fileURLToPath } from "node:url"

import { createNextConfig } from "@workspace/next-config"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * The public marketing site. It has no database and no session, so it only
 * needs the UI and i18n packages — never `@workspace/auth` or `@workspace/db`.
 */
export default createNextConfig({
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  workspacePackages: ["@workspace/ui", "@workspace/i18n"],
  experimental: {
    globalNotFound: true,
  },
  async redirects() {
    return [
      {
        // `www` is an alias of the apex; the ingress does the same at the edge
        // so this also holds when the app is served behind another proxy.
        source: "/:path*",
        has: [{ type: "host", value: "www.asynchrone.space" }],
        destination: "https://asynchrone.space/:path*",
        permanent: true,
      },
    ]
  },
})
