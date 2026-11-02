import { internalAudience } from "@workspace/contracts"
import {
  createInvalidationHandler,
  domainVerifier,
} from "@workspace/service-auth"

import { revalidateCachedReads } from "@/lib/internal/invalidation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Cross-app cache invalidation (issue #170).
 *
 * Copilot calls this after a mutation that changes this app's read models.
 * `revalidatePath` only affects the calling app, so the fan-out is explicit.
 */
export const POST = createInvalidationHandler({
  app: "clients",
  verifier: () => domainVerifier(internalAudience("clients")),
  revalidate: revalidateCachedReads,
})
