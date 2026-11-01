import { createAuditExportHandler } from "@workspace/audit"
import { SERVICE_SCOPES } from "@workspace/contracts"
import { prisma } from "@workspace/db-identity"

import { requireCopilotService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = createAuditExportHandler({
  app: "copilot",
  db: prisma,
  authorizeRead: (request) =>
    requireCopilotService(request, SERVICE_SCOPES.auditRead),
  authorizeWrite: (request) =>
    requireCopilotService(request, SERVICE_SCOPES.auditWrite),
})
