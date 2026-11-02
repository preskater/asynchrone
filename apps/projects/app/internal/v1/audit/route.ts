import { createAuditListHandler } from "@workspace/audit"
import { SERVICE_SCOPES } from "@workspace/contracts"

import { prisma } from "@/lib/prisma"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createAuditListHandler({
  app: "projects",
  db: prisma,
  authorizeRead: (request) => requireAppService(request, SERVICE_SCOPES.auditRead),
  authorizeWrite: (request) => requireAppService(request, SERVICE_SCOPES.auditWrite),
})
