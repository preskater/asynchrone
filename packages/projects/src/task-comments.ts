import { NotFoundError } from "@workspace/core/errors"
import type { MemberDirectoryPort } from "@workspace/organization/directory"

import type { ProjectDb } from "./db"
import type { ProjectAudit, ProjectNotify } from "./ports"

export interface TaskCommentDependencies {
  db: ProjectDb
  notify: ProjectNotify
  directory: MemberDirectoryPort
  audit?: ProjectAudit
}

export const TASK_COMMENT_MAX_LENGTH = 4000

export type AuthorKind = "internal" | "client" | "guest"

/** Stored author kind; anything unknown renders as the team. */
export function authorKindOf(value: string): AuthorKind {
  return value === "client" || value === "guest" ? value : "internal"
}

export interface TaskCommentData {
  id: string
  authorId: string
  authorKind: "internal" | "client" | "guest"
  authorName?: string
  body: string
  createdAt: string
}

type CommentRow = {
  id: string
  authorId: string
  authorKind: string
  authorName: string | null
  body: string
  createdAt: Date
}

async function namesByIds(
  directory: MemberDirectoryPort,
  organizationId: string,
  ids: string[]
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>()
  if (ids.length === 0) return nameById
  const members = await directory.list(organizationId)
  const wanted = new Set(ids)
  for (const member of members) {
    if (wanted.has(member.userId)) nameById.set(member.userId, member.name)
  }
  return nameById
}

export async function listTaskComments(
  { db, directory }: TaskCommentDependencies,
  organizationId: string,
  taskId: string
): Promise<TaskCommentData[]> {
  const rows = await db.taskComment.findMany({
    where: { taskId, task: { organizationId } },
    orderBy: { createdAt: "asc" },
  })
  const missingNames = [
    ...new Set(
      rows.filter((row) => !row.authorName).map((row) => row.authorId)
    ),
  ]
  const nameById = await namesByIds(directory, organizationId, missingNames)
  return rows.map((row) => mapComment(row, nameById))
}

function mapComment(
  row: CommentRow,
  nameById: Map<string, string>
): TaskCommentData {
  return {
    id: row.id,
    authorId: row.authorId,
    authorKind: authorKindOf(row.authorKind),
    authorName: row.authorName ?? nameById.get(row.authorId),
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Add a comment to a task. Comments from the client notify the internal
 * project members so the team sees them in the header bell.
 */
export async function createTaskComment(
  { db, notify, directory, audit }: TaskCommentDependencies,
  input: {
    organizationId: string
    taskId: string
    authorId: string
    authorKind: AuthorKind
    authorName?: string
    body: string
  }
): Promise<TaskCommentData> {
  const task = await db.task.findFirst({
    where: { id: input.taskId, organizationId: input.organizationId },
    select: {
      id: true,
      identifier: true,
      title: true,
      projectId: true,
      project: { select: { name: true } },
    },
  })
  if (!task) throw new NotFoundError("Task")

  const row = await db.taskComment.create({
    data: {
      taskId: input.taskId,
      authorId: input.authorId,
      authorKind: input.authorKind,
      authorName: input.authorName ?? null,
      body: input.body,
    },
  })

  await audit?.(
    {
      organizationId: input.organizationId,
      userId: input.authorId,
      userName: input.authorName ?? "Client",
      userEmail: "",
    },
    {
      action: "task.comment.added",
      entityType: "task",
      entityId: input.taskId,
      entityLabel: input.body.slice(0, 120),
      after: { authorKind: input.authorKind },
    }
  )
  // Clients and external guests are outside the team: tell the project members.
  if (input.authorKind !== "internal") {
    await notifyTeamOfClientComment({ db, notify, directory }, input, task)
  }

  const nameById = await namesByIds(
    directory,
    input.organizationId,
    row.authorName ? [] : [row.authorId]
  )
  return mapComment(row, nameById)
}

async function notifyTeamOfClientComment(
  { db, notify, directory }: TaskCommentDependencies,
  input: {
    organizationId: string
    authorId: string
    authorName?: string
    body: string
  },
  task: {
    id: string
    identifier: string
    title: string
    projectId: string
    project: { name: string } | null
  }
): Promise<void> {
  const members = await db.projectMember.findMany({
    where: { projectId: task.projectId },
    select: { userId: true },
  })
  if (members.length === 0) return

  const memberIds = new Set(members.map((member) => member.userId))
  const internalMembers = (await directory.list(input.organizationId))
    .filter(
      (member) => member.clientId == null && memberIds.has(member.userId)
    )
    .map((member) => ({ userId: member.userId }))

  const preview =
    input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body
  await Promise.all(
    internalMembers.map((member) =>
      notify({
        organizationId: input.organizationId,
        userId: member.userId,
        actorId: input.authorId,
        type: "portal.comment",
        data: {
          projectId: task.projectId,
          projectName: task.project?.name ?? "",
          taskId: task.id,
          identifier: task.identifier,
          title: task.title,
          actorName: input.authorName ?? "",
          preview,
        },
      })
    )
  )
}
