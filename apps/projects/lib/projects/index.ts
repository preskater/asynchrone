import { ProjectRepository } from "@workspace/projects/repository"
import { ProjectService } from "@workspace/projects/service"

import { recordUserAudit } from "@/lib/audit"
import { repositoryIntegrationService } from "@/lib/integrations"
import { createNotificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter for the projects domain.
 *
 * `@workspace/projects` owns the repository, service, schemas, types and UI.
 * This file binds the database client, the audit writer, the notification
 * inbox and the repository integration; the package never imports the app.
 */
export const notificationService = createNotificationService(prisma)

export const projectRepository = new ProjectRepository(prisma)

/**
 * Repository sync is built before the service so the service can push task
 * changes. The webhook endpoint stays on Copilot until #190, so newly created
 * connections keep registering the URL that already receives deliveries.
 */
export const projectService = new ProjectService(projectRepository, prisma, {
  audit: recordUserAudit,
  notify: (args) => notificationService.notify(args),
  repository: repositoryIntegrationService,
})

export { ProjectRepository, ProjectService }
