import { createMetricsRoute } from "@workspace/observability/next"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Prometheus scrape target (see the chart's pod annotations). */
export const GET = createMetricsRoute({ app: "landing" })
