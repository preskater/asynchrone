import { ProjectRepository } from "@workspace/projects/repository"
import { ProjectService } from "@workspace/projects/service"
import type { ProjectRepositorySync } from "@workspace/projects/ports"

import { recordUserAudit } from "@/lib/audit"
import { createNotificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * App adapter for the projects domain, used only by the calendar task overlay.
 *
 * `@workspace/projects` owns the repository, service and types. The calendars
 * app needs one read (`listWorkspace`, for the task chips on the calendar), so
 * it binds the shared client until the projects internal API exists (#190).
 *
 * Repository sync is not reachable from this app: tasks are read-only here, and
 * the project screens that create or push issues live in `apps/projects`. The
 * port is still required by the service constructor, so it fails loudly rather
 * than pretending a repository is connected.
 */
const unreachableRepositorySync: ProjectRepositorySync = {
  createTaskInRepository: () => {
    throw new Error(
      "Repository sync belongs to the projects app; the calendars app reads tasks only."
    )
  },
  pushTaskStatus: () => {
    throw new Error(
      "Repository sync belongs to the projects app; the calendars app reads tasks only."
    )
  },
  scheduleContentPush: () => {
    throw new Error(
      "Repository sync belongs to the projects app; the calendars app reads tasks only."
    )
  },
  closeTaskIssue: () => {
    throw new Error(
      "Repository sync belongs to the projects app; the calendars app reads tasks only."
    )
  },
}

export const notificationService = createNotificationService(prisma)

export const projectRepository = new ProjectRepository(prisma)

export const projectService = new ProjectService(projectRepository, prisma, {
  audit: recordUserAudit,
  notify: (args) => notificationService.notify(args),
  repository: unreachableRepositorySync,
})
