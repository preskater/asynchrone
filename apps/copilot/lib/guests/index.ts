import { z } from "zod"

import { DomainClientError, type DomainOperation } from "@workspace/contracts"
import { AppError, type ErrorCode } from "@workspace/core/errors"
import { taskStatusSchema } from "@workspace/projects/schemas"
import type { ProjectMessageData } from "@workspace/projects/thread"
import type { TaskCommentData } from "@workspace/projects/task-comments"

import { recordUserAudit } from "@/lib/audit/record"
import { sendGuestInvitationEmail } from "@/lib/email"
import {
  callDomain,
  delegatedContext,
  delegatedGuestContext,
} from "@/lib/internal/domain"
import { getOrganizationEntitlements } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

import { createGuestService, type GuestContext } from "./service"

/** Copilot's binding of the external-collaborator grants (ADR 0041). */
export const guestService = createGuestService({
  db: prisma,
  async findProject(ctx, projectId) {
    try {
      return await callDomain(
        "projects",
        "get-project",
        delegatedContext(ctx),
        { projectId },
        z.object({ id: z.string(), name: z.string() }).nullable()
      )
    } catch (error) {
      if (error instanceof DomainClientError && error.status === 404) {
        return null
      }
      throw error
    }
  },
  async guestLimit(organizationId) {
    return (await getOrganizationEntitlements(organizationId))
      .externalCollaborators
  },
  audit: recordUserAudit,
  sendInvitation: sendGuestInvitationEmail,
  acceptUrl(token) {
    const base = (
      process.env.COPILOT_APP_URL ??
      process.env.BETTER_AUTH_URL ??
      ""
    ).replace(/\/+$/, "")
    return `${base}/guest/accept?token=${encodeURIComponent(token)}`
  },
})

/** Projects the inviting member can share, for the invite dialog. */
export async function listShareableProjects(
  ctx: Parameters<typeof delegatedContext>[0]
) {
  return callDomain(
    "projects",
    "list-project-options",
    delegatedContext(ctx),
    {},
    z.array(z.object({ id: z.string(), name: z.string() }))
  )
}

const taskSummary = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().optional(),
})

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  dueDate: z.string().optional(),
  createdAt: z.string(),
  tasks: z.array(taskSummary),
})

const taskSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.string(),
  priority: z.string(),
  dueDate: z.string().optional(),
  endDate: z.string().optional(),
  createdAt: z.string(),
  labels: z.array(z.string()),
  subtasks: z.array(
    z.object({ id: z.string(), title: z.string(), done: z.boolean() })
  ),
})

const messageSchema = z.custom<ProjectMessageData>()
const commentSchema = z.custom<TaskCommentData>()

/**
 * One guest call. A refusal from the projects app (404, missing capability)
 * becomes a typed app error so pages can 404 and actions can show the reason.
 */
async function guestCall<T>(
  operation: DomainOperation,
  ctx: GuestContext,
  input: unknown,
  schema: z.ZodType<T>
): Promise<T> {
  try {
    return await callDomain(
      "projects",
      operation,
      delegatedGuestContext(ctx),
      input,
      schema
    )
  } catch (error) {
    if (error instanceof DomainClientError && error.status < 500) {
      throw new AppError(error.code as ErrorCode, error.message, {
        status: error.status,
      })
    }
    throw error
  }
}

/** Reads and writes a guest makes, always through its grant's context. */
export const guestProjects = {
  getProject: (ctx: GuestContext) =>
    guestCall("guest-get-project", ctx, {}, projectSchema),
  getTask: (ctx: GuestContext, taskId: string) =>
    guestCall("guest-get-task", ctx, { taskId }, taskSchema),
  updateTaskStatus: (
    ctx: GuestContext,
    taskId: string,
    status: z.infer<typeof taskStatusSchema>
  ) =>
    guestCall(
      "guest-update-task-status",
      ctx,
      { taskId, status },
      z.object({ id: z.string(), status: z.string() })
    ),
  listMessages: (ctx: GuestContext) =>
    guestCall("guest-list-messages", ctx, {}, z.array(messageSchema)),
  postMessage: (ctx: GuestContext, body: string) =>
    guestCall("guest-create-message", ctx, { body }, messageSchema),
  listTaskComments: (ctx: GuestContext, taskId: string) =>
    guestCall(
      "guest-list-task-comments",
      ctx,
      { taskId },
      z.array(commentSchema)
    ),
  postTaskComment: (ctx: GuestContext, taskId: string, body: string) =>
    guestCall(
      "guest-create-task-comment",
      ctx,
      { taskId, body },
      commentSchema
    ),
}

export type { GuestContext, GuestView } from "./service"
