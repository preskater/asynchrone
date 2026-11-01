import { SERVICE_SCOPES } from "@workspace/contracts"

import { handleAdminRequest } from "@/lib/admin/handler"
import { adminRepository } from "@/lib/admin/repository"
import { requireCopilotService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ path: string[] }> }

async function handle(request: Request, context: Context): Promise<Response> {
  const { path } = await context.params
  return handleAdminRequest({
    segments: path,
    request,
    repository: adminRepository,
    authorize: () =>
      requireCopilotService(request, SERVICE_SCOPES.identityAdmin),
  })
}

export function GET(request: Request, context: Context): Promise<Response> {
  return handle(request, context)
}

export function POST(request: Request, context: Context): Promise<Response> {
  return handle(request, context)
}
