import { createHealthRoute } from "@workspace/observability/next"

import { pool, prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Readiness probe: verifies this app's own database independently.
 *
 * A domain app's failure must not fail Copilot's probe, and vice versa — each
 * deployment is its own failure domain (issue #170).
 */
export const GET = createHealthRoute({
  app: "files",
  check: async () => {
    await prisma.$queryRaw`SELECT 1`
  },
  pool: () => pool,
})
