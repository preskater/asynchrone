import { ClientsRepository } from "@workspace/clients/repository"
import { ClientsService } from "@workspace/clients/service"

import { recordAuditMany, withActorIdentity } from "@/lib/audit"
import { clientFiles, clientProjects } from "@/lib/clients/ports"
import { memberDirectory } from "@/lib/identity"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter for the clients domain.
 *
 * `@workspace/clients` owns the repository, service, schemas, types and UI.
 * The app binds the database client, the audit writer and the notification
 * inbox here; the package never imports `apps/clients`.
 */
export const clientsRepository = new ClientsRepository(
  prisma,
  async (entries) => {
    await recordAuditMany(await withActorIdentity(entries), prisma)
    return { count: entries.length }
  },
  {
    directory: {
      async list(organizationId) {
        return (await memberDirectory.list(organizationId)).map((member) => ({
          userId: member.userId,
          name: member.name,
          email: member.email,
          role: member.role,
          clientId: member.clientId,
        }))
      },
    },
    projects: clientProjects,
    files: clientFiles,
  }
)

export const clientsService = new ClientsService(clientsRepository, {
  notify: (args) => notificationService.notify(args),
})

export { ClientsRepository, ClientsService }
