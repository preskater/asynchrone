import { createMetricsRoute } from "@workspace/observability/next"

import { pool } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Prometheus scrape target (see charts/asynchrone-space-app pod annotations). */
export const GET = createMetricsRoute({
  app: "files",
  pool: () => pool,
})
