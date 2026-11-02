import { internalAudience } from "@workspace/contracts"
import { createDomainHandler, domainVerifier } from "@workspace/service-auth"

import { dispatchDomain } from "@/lib/internal/domain"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Delegated internal domain API (Copilot assistant, MCP and portal). */
export const POST = createDomainHandler({
  app: "projects",
  verifier: () => domainVerifier(internalAudience("projects")),
  dispatch: dispatchDomain,
})
