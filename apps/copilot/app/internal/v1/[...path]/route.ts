import { SERVICE_SCOPES } from "@workspace/contracts"

import { handleIdentityRequest } from "@/lib/identity/handler"
import { identityRepository } from "@/lib/identity/repository"
import { requireCopilotService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params

  return handleIdentityRequest({
    segments: path,
    request,
    repository: identityRepository,
    authorize: () =>
      requireCopilotService(request, SERVICE_SCOPES.identityRead),
  })
}
