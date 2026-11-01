import type { ProjectDb } from "./db"
import type { ProjectNotify } from "./ports"

export interface ProjectThreadDependencies {
  db: ProjectDb
  notify: ProjectNotify
}

export const PROJECT_MESSAGE_MAX_LENGTH = 4000

export interface ProjectMessageData {
  id: string
  body: string
  authorId: string
  authorKind: "internal" | "client"
  authorName: string
  createdAt: string
}

type MessageRow = {
  id: string
  body: string
  authorId: string
  authorKind: string
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
    authorKind: row.authorKind === "client" ? "client" : "internal",
    authorName: nameById.get(row.authorId) ?? "",
    createdAt: row.createdAt.toISOString(),
  }
}

async function namesByIds(
  db: ProjectDb,
  ids: string[]
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>()
  if (ids.length === 0) return nameById
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  })
  for (const user of users) nameById.set(user.id, user.name)
  return nameById
}

/** The shared project thread, oldest first. Visible to the team and the client. */
export async function listProjectMessages(
  { db }: ProjectThreadDependencies,
  organizationId: string,
  projectId: string,
  limit = 200
): Promise<ProjectMessageData[]> {
  const rows = await db.projectMessage.findMany({
    where: { organizationId, projectId },
    orderBy: { createdAt: "asc" },
    take: limit,
  })
  const nameById = await namesByIds(db, [
    ...new Set(rows.map((row) => row.authorId)),
  ])
  return rows.map((row) => mapMessage(row, nameById))
}

/**
 * Append a message to the shared project thread. Client messages notify the
 * internal project members so the team sees replies in the header bell.
 */
export async function createProjectMessage(
  { db, notify }: ProjectThreadDependencies,
  input: {
    organizationId: string
    projectId: string
    authorId: string
    authorKind: "internal" | "client"
    body: string
  }
): Promise<ProjectMessageData> {
  const row = await db.projectMessage.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      authorId: input.authorId,
      authorKind: input.authorKind,
      body: input.body,
    },
  })

  const nameById = await namesByIds(db, [row.authorId])
  if (input.authorKind === "client") {
    await notifyTeamOfClientMessage(
      { db, notify },
      input.organizationId,
      input.projectId,
      row,
      nameById.get(row.authorId) ?? ""
    )
  }

  return mapMessage(row, nameById)
}

async function notifyTeamOfClientMessage(
  { db, notify }: ProjectThreadDependencies,
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
  const internalMembers = await db.member.findMany({
    where: {
      organizationId,
      userId: { in: memberIds },
      clientId: null,
    },
    select: { userId: true },
  })

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
