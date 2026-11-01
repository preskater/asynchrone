import { z } from "zod"

export const invitePortalUserSchema = z.object({
  clientId: z.string().min(1),
  email: z.email(),
  name: z.string().trim().max(120).optional(),
})

export const revokePortalMemberSchema = z.object({
  memberId: z.string().min(1),
})

export const cancelPortalInviteSchema = z.object({
  inviteId: z.string().min(1),
})

export const claimPortalAccessSchema = z.object({
  invitationId: z.string().min(1),
})

export const postProjectMessageSchema = z.object({
  projectId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})

export const postTaskCommentSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
})

export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>
export type RevokePortalMemberInput = z.infer<typeof revokePortalMemberSchema>
export type CancelPortalInviteInput = z.infer<typeof cancelPortalInviteSchema>
export type ClaimPortalAccessInput = z.infer<typeof claimPortalAccessSchema>
export type PostProjectMessageInput = z.infer<typeof postProjectMessageSchema>
export type PostTaskCommentInput = z.infer<typeof postTaskCommentSchema>
