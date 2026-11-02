import path from "node:path"
import { fileURLToPath } from "node:url"

import { securityHeaders } from "@workspace/next-config"

import type { NextConfig } from "next"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(projectRoot, "../../"),
  transpilePackages: [
    "@workspace/ui",
    "@workspace/db-control-tower",
    "@workspace/contracts",
    "@workspace/core",
    "@workspace/observability",
    "@workspace/service-auth",
  ],
  // `pg` is a native CommonJS dependency of the per-app database package.
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  experimental: {
    agentUpgrade: "security",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          noindex: true,
          referrerPolicy: "no-referrer",
          contentSecurityPolicy: false,
        }),
      },
    ]
  },
}

export default nextConfig
