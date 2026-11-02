import { createHealthRoute } from "@workspace/observability/next"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Liveness/readiness probe for the stateless landing site.
 *
 * The landing has no database and no session, so a successful render is the
 * whole check. It still reports independently to Sentry and exposes its own
 * request metrics (issue #170).
 */
export const GET = createHealthRoute({ app: "landing" })
