import { createUserDeletionHandler } from "@workspace/sagas"
import { SERVICE_SCOPES } from "@workspace/contracts"

import { deleteOrganization, deleteUser } from "@/lib/internal/saga"
import { exportOrganization } from "@/lib/internal/export"
import { requireAppService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Idempotent account deletion; identity is removed last by the saga. */
export const DELETE = createUserDeletionHandler({
  app: "messages",
  authorizeDelete: (request) => requireAppService(request, SERVICE_SCOPES.deleteWrite),
  authorizeExport: (request) => requireAppService(request, SERVICE_SCOPES.exportRead),
  deleteOrganization,
  deleteUser,
  exportOrganization,
})
