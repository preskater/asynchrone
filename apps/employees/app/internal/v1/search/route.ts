import { SERVICE_SCOPES } from "@workspace/contracts"
import { createSearchHandler } from "@workspace/search"

import { requireAppService } from "@/lib/internal/service"
import { search } from "@/lib/search"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** This app's slice of Copilot's global search. */
export const GET = createSearchHandler({
  app: "employees",
  authorize: (request) => requireAppService(request, SERVICE_SCOPES.searchRead),
  search,
})
