"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import { parseLocalized } from "@/lib/core/validation-server"
import { roleRank } from "@workspace/organization/roles"
import { postProjectMessageSchema } from "@/lib/portal/schemas"
import { prisma } from "@/lib/prisma"
import { createProjectMessage, listProjectMessages } from "@/lib/projects/thread"

async function requireProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!project) throw new NotFoundError("Project")
  return project
}

/** The shared team ↔ client thread of a project. */
export const listProjectMessagesAction = withAction(async (projectId: string) => {
  const ctx = await getRequestContext()
  await requireProject(ctx.organizationId, String(projectId))
  return listProjectMessages(ctx.organizationId, String(projectId))
})

/** Post a message on the shared thread as a team member. */
export const postProjectMessageAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(postProjectMessageSchema, input)
  if (roleRank(ctx.role) < 2) {
    throw new ForbiddenError("Your role cannot post messages.", {
      code: "role_cannot_send_messages",
    })
  }
  await requireProject(ctx.organizationId, parsed.projectId)
  return createProjectMessage({
    organizationId: ctx.organizationId,
    projectId: parsed.projectId,
    authorId: ctx.userId,
    authorKind: "internal",
    body: parsed.body,
  })
})
