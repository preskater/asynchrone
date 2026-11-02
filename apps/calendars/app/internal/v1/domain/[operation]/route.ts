import { internalAudience } from "@workspace/contracts"
import { createDomainHandler, domainVerifier } from "@workspace/service-auth"

import { dispatchDomain } from "@/lib/internal/domain"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const POST = createDomainHandler({
  app: "calendars",
  verifier: () => domainVerifier(internalAudience("calendars")),
  dispatch: dispatchDomain,
})
