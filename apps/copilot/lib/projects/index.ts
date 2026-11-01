import { repositoryIntegrationService } from "@/lib/integrations"
import { recordUserAudit } from "@/lib/audit/record"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

import { ProjectRepository } from "@workspace/projects/repository"
import { ProjectService } from "@workspace/projects/service"

/**
 * App adapter for the projects domain.
 *
 * `@workspace/projects` owns the repository, service, schemas, types and UI.
 * The app binds the database client, the audit writer, the notification inbox
 * and the repository integration here; the package never imports `apps/copilot`.
 */
export const projectRepository = new ProjectRepository(prisma)

export const projectService = new ProjectService(projectRepository, prisma, {
  audit: recordUserAudit,
  notify: (args) => notificationService.notify(args),
  repository: repositoryIntegrationService,
})

export { ProjectRepository, ProjectService }
export * from "@workspace/projects/schemas"
export type {
  Activity,
  Comment,
  Label,
  Member,
  Project,
  ProjectData,
  Subtask,
  Task,
  TaskPriority,
  TaskStatus,
} from "@workspace/projects/types"
