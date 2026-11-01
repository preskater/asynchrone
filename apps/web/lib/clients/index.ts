import { ClientsRepository } from "@workspace/clients/repository"
import { ClientsService } from "@workspace/clients/service"

import { recordAuditMany, withActorIdentity } from "@/lib/audit/record"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter for the clients domain.
 *
 * `@workspace/clients` owns the repository, service, schemas, types and UI.
 * The app binds the database client, the audit writer and the notification
 * inbox here; the package never imports `apps/web`.
 */
export const clientsRepository = new ClientsRepository(
  prisma,
  async (entries) => {
    await recordAuditMany(await withActorIdentity(entries, prisma), prisma)
    return { count: entries.length }
  }
)

export const clientsService = new ClientsService(clientsRepository, {
  notify: (args) => notificationService.notify(args),
})

export { ClientsRepository, ClientsService }
