import { pool, prisma } from "@workspace/db-control-tower"
import { createHealthRoute } from "@workspace/observability/next"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Readiness probe for the control tower's own database.
 *
 * The control tower is an independent failure domain: it never reads the
 * customer database, so this probe only checks `asynchrone_control_tower`.
 */
export const GET = createHealthRoute({
  app: "control-tower",
  check: async () => {
    await prisma.$queryRaw`SELECT 1`
  },
  pool: () => pool,
})
