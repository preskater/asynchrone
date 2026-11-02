import type { ServiceScope } from "@workspace/contracts"

import { handleIdentityRequest } from "@/lib/identity/handler"
import { identityRepository } from "@/lib/identity/repository"
import { requireCopilotService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

async function handle(
  request: Request,
  context: Context
): Promise<Response> {
  const { path } = await context.params

  return handleIdentityRequest({
    segments: path,
    request,
    repository: identityRepository,
    authorize: (scope: ServiceScope) =>
      requireCopilotService(request, scope),
  })
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
