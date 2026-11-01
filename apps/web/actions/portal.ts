"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { UnauthorizedError } from "@workspace/core/errors"
import { parseLocalized } from "@/lib/core/validation-server"
import { portalService } from "@/lib/portal"
import { getPortalContext } from "@/lib/portal/context"
import {
  cancelPortalInviteSchema,
  claimPortalAccessSchema,
  invitePortalUserSchema,
  postProjectMessageSchema,
  postTaskCommentSchema,
  revokePortalMemberSchema,
} from "@workspace/portal/schemas"
import { revalidateOrgPath } from "@/lib/organization/paths"

export const invitePortalUserAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(invitePortalUserSchema, input)
  const result = await portalService.invite(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return result
})

export const revokePortalMemberAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(revokePortalMemberSchema, input)
  const result = await portalService.revokeMember(ctx, parsed.memberId)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return result
})

export const cancelPortalInviteAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(cancelPortalInviteSchema, input)
  const result = await portalService.cancelInvite(ctx, parsed.inviteId)
  await revalidateOrgPath(ctx.organizationId, "/clients")
  return result
})

/**
 * Called from the accept-invitation page right after accepting, to link the
 * new member to the invited company. Works before the active organization is
 * set, so it relies on the invitation id only.
 */
export const claimPortalAccessAction = withAction(async (input: unknown) => {
  const parsed = await parseLocalized(claimPortalAccessSchema, input)
  return portalService.claim(parsed.invitationId)
})

/** Post a message on the shared project thread as the signed-in client. */
export const postPortalMessageAction = withAction(async (input: unknown) => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  const parsed = await parseLocalized(postProjectMessageSchema, input)
  return portalService.postMessage(ctx, parsed.projectId, parsed.body)
})

/** Clears the client's unread badges for the next visit. */
export const markPortalSeenAction = withAction(async () => {
  const ctx = await getPortalContext()
  if (!ctx) throw new UnauthorizedError()
  await portalService.markSeen(ctx)
  return { ok: true }
})

/** Add a comment to a task from the portal (subject to the project policy). */
export const postPortalTaskCommentAction = withAction(
  async (input: unknown) => {
    const ctx = await getPortalContext()
    if (!ctx) throw new UnauthorizedError()
    const parsed = await parseLocalized(postTaskCommentSchema, input)
    return portalService.postTaskComment(
      ctx,
      parsed.projectId,
      parsed.taskId,
      parsed.body
    )
  }
)
