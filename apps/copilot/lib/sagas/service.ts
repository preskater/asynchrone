import {
  runOrganizationDeletionSaga,
  runUserDeletionSaga,
  type DeletionSagaResult,
} from "@workspace/sagas"

import { deleteOrganization } from "@/lib/organization/deletion-service"

import { sagaRemotes } from "./remotes"
import { deletionSagaStore } from "./store"

/**
 * Cross-database organization deletion.
 *
 * Each domain app deletes its own rows first; identity (the existing monolith
 * tables until the cutover completes) is deleted last. With no domain app
 * configured, the legacy single-database path still runs.
 */
export async function deleteOrganizationAcrossApps(
  organizationId: string,
  requestedById?: string | null,
  now = new Date()
): Promise<DeletionSagaResult | { deleted: boolean }> {
  const { apps, clients } = sagaRemotes()
  if (apps.length === 0) {
    return { deleted: await deleteOrganization(organizationId, now) }
  }

  return runOrganizationDeletionSaga({
    organizationId,
    apps,
    clients,
    store: deletionSagaStore,
    requestedById,
    now,
  })
}

/**
 * Cross-database account deletion. Domain apps anonymize their rows first;
 * the identity account is removed last.
 */
export async function deleteUserAcrossApps(
  userId: string,
  organizationId?: string | null,
  now = new Date()
): Promise<DeletionSagaResult> {
  const { apps, clients } = sagaRemotes()
  return runUserDeletionSaga({
    userId,
    organizationId,
    apps,
    clients,
    store: deletionSagaStore,
    now,
  })
}
