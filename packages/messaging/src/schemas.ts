import { z } from "zod"

export const presenceSchema = z.enum(["online", "away", "busy", "offline"])

export const conversationKindSchema = z.enum(["channel", "dm"])

export const attachmentKindSchema = z.enum(["file", "image"])

export const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  kind: attachmentKindSchema.default("file"),
  meta: z.string().optional(),
  oid: z.number().int().nonnegative().optional(),
  mimeType: z.string().max(255).optional(),
  sha256: z.string().max(64).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
})

export const meetingMetaSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.string(),
  durationMinutes: z.number().int().positive(),
})

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().min(1).max(8000),
  attachments: z.array(attachmentSchema).optional(),
  meeting: meetingMetaSchema.optional(),
  parentId: z.string().optional(),
})

export const editMessageSchema = z.object({
  body: z.string().min(1).max(8000),
})

export const addThreadReplySchema = z.object({
  parentId: z.string().min(1),
  body: z.string().min(1).max(8000),
})

export const toggleReactionSchema = z.object({
  emoji: z.string().min(1).max(16),
})

export const startDmSchema = z.object({
  memberId: z.string().min(1),
})

export const createChannelSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().min(1).max(120),
  topic: z.string().max(500).optional(),
})

export const setTypingSchema = z.object({
  memberId: z.string().min(1),
  isTyping: z.boolean(),
})

export const muteSchema = z.object({
  muted: z.boolean().optional(),
})

export const pinSchema = z.object({
  pinned: z.boolean().optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
export type AddThreadReplyInput = z.infer<typeof addThreadReplySchema>
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>
export type StartDmInput = z.infer<typeof startDmSchema>
export type CreateChannelInput = z.infer<typeof createChannelSchema>
export type SetTypingInput = z.infer<typeof setTypingSchema>
