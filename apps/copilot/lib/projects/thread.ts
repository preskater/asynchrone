import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

import {
  createProjectMessage as createProjectMessageInDb,
  listProjectMessages as listProjectMessagesInDb,
  type ProjectMessageData,
  type ProjectThreadDependencies,
} from "@workspace/projects/thread"

/**
 * App adapter for the shared project thread: binds the identity client and
 * the notification inbox that `@workspace/projects` requires.
 */
const dependencies: ProjectThreadDependencies = {
  db: prisma,
  notify: (args) => notificationService.notify(args),
}

export const listProjectMessages = (
  organizationId: string,
  projectId: string,
  limit?: number
) => listProjectMessagesInDb(dependencies, organizationId, projectId, limit)

export const createProjectMessage = (
  input: Parameters<typeof createProjectMessageInDb>[1]
) => createProjectMessageInDb(dependencies, input)

export { PROJECT_MESSAGE_MAX_LENGTH } from "@workspace/projects/thread"
export type { ProjectMessageData }
