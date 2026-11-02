import { createOrganizationExportHandler } from "@workspace/sagas"
import { SERVICE_SCOPES } from "@workspace/contracts"

import { exportOrganization } from "@/lib/internal/export"
import { deleteOrganization, deleteUser } from "@/lib/internal/saga"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** One app part of the cross-database export (Copilot writes the archive). */
export const GET = createOrganizationExportHandler({
  app: "messages",
  authorizeExport: (request) => requireAppService(request, SERVICE_SCOPES.exportRead),
  authorizeDelete: (request) => requireAppService(request, SERVICE_SCOPES.deleteWrite),
  exportOrganization,
  deleteOrganization,
  deleteUser,
})
