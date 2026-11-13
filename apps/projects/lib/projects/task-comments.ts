import { recordUserAudit } from "@/lib/audit"
import { memberDirectory } from "@/lib/identity"
import { prisma } from "@/lib/prisma"
import { notificationService } from "@/lib/projects"
import { publishTaskCommentChange } from "@/lib/realtime"

import {
  createTaskComment as createTaskCommentInDb,
  listTaskComments as listTaskCommentsInDb,
  type TaskCommentData,
  type TaskCommentDependencies,
} from "@workspace/projects/task-comments"

/**
 * App adapter for task comments: binds the database client and the
 * notification inbox that `@workspace/projects` requires.
 */
const dependencies: TaskCommentDependencies = {
  db: prisma,
  notify: (args) => notificationService.notify(args),
  directory: memberDirectory,
  audit: recordUserAudit,
  changed: publishTaskCommentChange,
}

export const listTaskComments = (organizationId: string, taskId: string) =>
  listTaskCommentsInDb(dependencies, organizationId, taskId)

export const createTaskComment = (
  input: Parameters<typeof createTaskCommentInDb>[1]
) => createTaskCommentInDb(dependencies, input)

export { TASK_COMMENT_MAX_LENGTH } from "@workspace/projects/task-comments"
export type { TaskCommentData }
