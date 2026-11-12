import type { MemberDirectoryPort } from "@workspace/organization/directory"

import type { ProjectDb } from "./db"
import type { ProjectAudit, ProjectNotify } from "./ports"
import { authorKindOf, type AuthorKind } from "./task-comments"

export interface ProjectThreadDependencies {
  db: ProjectDb
  notify: ProjectNotify
  directory: MemberDirectoryPort
  audit?: ProjectAudit
}

export const PROJECT_MESSAGE_MAX_LENGTH = 4000

export interface ProjectMessageData {
  id: string
  body: string
  authorId: string
  authorKind: AuthorKind
  authorName: string
  createdAt: string
}

type MessageRow = {
  id: string
  body: string
  authorId: string
  authorKind: string
  authorName?: string | null
  createdAt: Date
}

function mapMessage(
  row: MessageRow,
  nameById: Map<string, string>
): ProjectMessageData {
  return {
    id: row.id,
    body: row.body,
    authorId: row.authorId,
    authorKind: authorKindOf(row.authorKind),
    authorName: row.authorName ?? nameById.get(row.authorId) ?? "",
    createdAt: row.createdAt.toISOString(),
  }
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

/** The shared project thread, oldest first. Visible to the team and the client. */
export async function listProjectMessages(
  { db, directory }: ProjectThreadDependencies,
  organizationId: string,
  projectId: string,
  limit = 200
): Promise<ProjectMessageData[]> {
  const rows = await db.projectMessage.findMany({
    where: { organizationId, projectId },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
  const nameById = await namesByIds(directory, organizationId, [
    ...new Set(rows.map((row) => row.authorId)),
  ])
  return rows.map((row) => mapMessage(row, nameById))
}

/**
 * Append a message to the shared project thread. Client messages notify the
 * internal project members so the team sees replies in the header bell.
 */
export async function createProjectMessage(
  { db, notify, directory, audit }: ProjectThreadDependencies,
  input: {
    organizationId: string
    projectId: string
    authorId: string
    authorKind: AuthorKind
    /** Snapshot for authors outside the member directory (guests). */
    authorName?: string
    body: string
  }
): Promise<ProjectMessageData> {
  const row = await db.projectMessage.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
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
      userName:
        input.authorName ??
        (input.authorKind === "internal" ? "Team" : "Client"),
      userEmail: "",
    },
    {
      action: "project.message.added",
      entityType: "project",
      entityId: input.projectId,
      entityLabel: input.body.slice(0, 120),
      after: { authorKind: input.authorKind },
    }
  )
  const nameById = await namesByIds(directory, input.organizationId, [
    row.authorId,
  ])
  if (input.authorKind !== "internal") {
    await notifyTeamOfClientMessage(
      { db, notify, directory },
      input.organizationId,
      input.projectId,
      row,
      input.authorName ?? nameById.get(row.authorId) ?? ""
    )
  }

  return mapMessage(row, nameById)
}

async function notifyTeamOfClientMessage(
  { db, notify, directory }: ProjectThreadDependencies,
  organizationId: string,
  projectId: string,
  row: MessageRow,
  authorName: string
): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      name: true,
      members: { select: { userId: true } },
    },
  })
  if (!project) return

  const memberIds = project.members.map((member) => member.userId)
  if (memberIds.length === 0) return

  // Only internal members: portal users of the same company don't need the bell.
  const wanted = new Set(memberIds)
  const internalMembers = (await directory.list(organizationId))
    .filter(
      (member) => member.clientId == null && wanted.has(member.userId)
    )
    .map((member) => ({ userId: member.userId }))

  const preview =
    row.body.length > 120 ? `${row.body.slice(0, 117)}...` : row.body
  await Promise.all(
    internalMembers.map((member) =>
      notify({
        organizationId,
        userId: member.userId,
        actorId: row.authorId,
        type: "portal.message",
        data: {
          projectId,
          projectName: project.name,
          actorName: authorName,
          preview,
        },
      })
    )
  )
}
