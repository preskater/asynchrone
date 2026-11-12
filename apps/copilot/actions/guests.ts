"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import { ForbiddenError, UnauthorizedError } from "@workspace/core/errors"
import {
  DEFAULT_GUEST_CAPABILITIES,
  GUEST_CAPABILITIES,
  GUEST_EXPIRY_DAYS,
} from "@workspace/core/guests"
import { taskStatusSchema } from "@workspace/projects/schemas"

import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { guestProjects, guestService } from "@/lib/guests"
import { getGuestUser, requireGuestContext } from "@/lib/guests/session"
import { revalidateOrgPath } from "@/lib/organization/paths"

const inviteSchema = z.object({
  projectId: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  expiresInDays: z.coerce
    .number()
    .int()
    .refine((days) => (GUEST_EXPIRY_DAYS as readonly number[]).includes(days)),
  capabilities: z
    .array(z.enum(GUEST_CAPABILITIES))
    .default([...DEFAULT_GUEST_CAPABILITIES]),
})
const idSchema = z.object({ id: z.string().min(1) })
const tokenSchema = z.object({ token: z.string().min(1).max(200) })
const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) })

// --- host organization (owners and admins) ---

export const inviteGuestAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(inviteSchema, input)
  const result = await guestService.invite(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/settings")
  return result
})

export const revokeGuestAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const { id } = await parseLocalized(idSchema, input)
  await guestService.revoke(ctx, id)
  await revalidateOrgPath(ctx.organizationId, "/settings")
  return { ok: true }
})

// --- the guest ---

export const acceptGuestInvitationAction = withAction(
  async (input: unknown) => {
    const user = await getGuestUser()
    if (!user) throw new UnauthorizedError()
    const { token } = await parseLocalized(tokenSchema, input)
    return { grantId: await guestService.accept(user, token) }
  }
)

export const leaveGuestProjectAction = withAction(async (input: unknown) => {
  const user = await getGuestUser()
  if (!user) throw new UnauthorizedError()
  const { id } = await parseLocalized(idSchema, input)
  await guestService.leave(user, id)
  return { ok: true }
})

/*
 * The guest space reuses the portal thread and comment components, which call
 * `{ projectId, body }`. The page binds the grant id; the project always comes
 * from the grant, so a tampered `projectId` or `grantId` changes nothing.
 */
export const postGuestMessageAction = withAction(
  async (grantId: string, input: unknown) => {
    const { body } = await parseLocalized(bodySchema, input)
    const ctx = await requireGuestContext(grantId)
    return guestProjects.postMessage(ctx, body)
  }
)

export const postGuestTaskCommentAction = withAction(
  async (grantId: string, input: unknown) => {
    const parsed = await parseLocalized(
      bodySchema.extend({ taskId: z.string().min(1) }),
      input
    )
    const ctx = await requireGuestContext(grantId)
    return guestProjects.postTaskComment(ctx, parsed.taskId, parsed.body)
  }
)

/** Portal-only actions (seen markers, meetings) have no guest equivalent. */
export const guestUnsupportedAction = withAction(async (): Promise<never> => {
  throw new ForbiddenError()
})

export const updateGuestTaskStatusAction = withAction(
  async (input: unknown) => {
    const parsed = await parseLocalized(
      z.object({
        grantId: z.string().min(1),
        taskId: z.string().min(1),
        status: taskStatusSchema,
      }),
      input
    )
    const ctx = await requireGuestContext(parsed.grantId)
    return guestProjects.updateTaskStatus(ctx, parsed.taskId, parsed.status)
  }
)
