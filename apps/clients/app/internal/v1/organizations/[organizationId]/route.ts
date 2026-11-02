import { createOrganizationDeletionHandler } from "@workspace/sagas"
import { SERVICE_SCOPES } from "@workspace/contracts"

import { deleteOrganization, deleteUser } from "@/lib/internal/saga"
import { exportOrganization } from "@/lib/internal/export"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Idempotent organization deletion for the identity saga. */
export const DELETE = createOrganizationDeletionHandler({
  app: "clients",
  authorizeDelete: (request) => requireAppService(request, SERVICE_SCOPES.deleteWrite),
  authorizeExport: (request) => requireAppService(request, SERVICE_SCOPES.exportRead),
  deleteOrganization,
  deleteUser,
  exportOrganization,
})
