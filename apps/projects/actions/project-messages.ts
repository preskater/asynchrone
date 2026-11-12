"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import { PROJECT_MESSAGE_MAX_LENGTH } from "@workspace/projects/thread"
import { can } from "@workspace/organization/roles"

import {
  createProjectMessage,
  listProjectMessages,
} from "@/lib/projects/thread"
import { prisma } from "@/lib/prisma"
import { getRequestContext, parseLocalized } from "@/lib/request-context"

const postProjectMessageSchema = z.object({
  projectId: z.string().min(1),
  body: z.string().trim().min(1).max(PROJECT_MESSAGE_MAX_LENGTH),
})

async function requireProject(organizationId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!project) throw new NotFoundError("Project")
  return project
}

/** The shared team ↔ client thread of a project. */
export const listProjectMessagesAction = withAction(
  async (projectId: string) => {
    const ctx = await getRequestContext()
    await requireProject(ctx.organizationId, String(projectId))
    return listProjectMessages(ctx.organizationId, String(projectId))
  }
)

/** Post a message on the shared thread as a team member. */
export const postProjectMessageAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(postProjectMessageSchema, input)
  if (!can(ctx, "message:write")) {
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
