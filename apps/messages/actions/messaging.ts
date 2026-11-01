"use server"

import { withAction } from "@workspace/core/action"

import { messagingService } from "@/lib/messaging"
import {
  getRequestContext,
  parseLocalized,
  revalidateOrgPath,
} from "@/lib/request-context"
import {
  addThreadReplySchema,
  createChannelSchema,
  editMessageSchema,
  muteSchema,
  pinSchema,
  sendMessageSchema,
  setTypingSchema,
  startDmSchema,
  toggleReactionSchema,
} from "@workspace/messaging/schemas"

export const listMessagingAction = withAction(async () => {
  const ctx = await getRequestContext()
  return messagingService.list(ctx)
})

export const listMessagesAction = withAction(
  async (conversationId: string, cursor?: string | null) => {
    const ctx = await getRequestContext()
    return messagingService.listMessages(ctx, conversationId, { cursor })
  }
)

export const touchPresenceAction = withAction(async () => {
  const ctx = await getRequestContext()
  await messagingService.touchPresence(ctx)
  return { ok: true }
})

export const sendMessageAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(sendMessageSchema, input)
  const message = await messagingService.sendMessage(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId)
  return message
})

export const editMessageAction = withAction(
  async (id: string, body: string) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(editMessageSchema, { body })
    const message = await messagingService.editMessage(ctx, id, parsed)
    await revalidateOrgPath(ctx.organizationId)
    return message
  }
)

export const deleteMessageAction = withAction(async (id: string) => {
  const ctx = await getRequestContext()
  const result = await messagingService.deleteMessage(ctx, id)
  await revalidateOrgPath(ctx.organizationId)
  return result
})

export const toggleReactionAction = withAction(
  async (messageId: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(toggleReactionSchema, input)
    const message = await messagingService.toggleReaction(
      ctx,
      messageId,
      parsed
    )
    await revalidateOrgPath(ctx.organizationId)
    return message
  }
)

export const addThreadReplyAction = withAction(
  async (parentId: string, body: string) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(addThreadReplySchema, {
      parentId,
      body,
    })
    const message = await messagingService.addThreadReply(ctx, parsed)
    await revalidateOrgPath(ctx.organizationId)
    return message
  }
)

export const markReadAction = withAction(async (conversationId: string) => {
  const ctx = await getRequestContext()
  return messagingService.markRead(ctx, conversationId)
})

export const startDmAction = withAction(async (memberId: string) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(startDmSchema, { memberId })
  const conversation = await messagingService.startDirectMessage(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId)
  return conversation
})

export const createChannelAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(createChannelSchema, input)
  const conversation = await messagingService.createChannel(ctx, parsed)
  await revalidateOrgPath(ctx.organizationId)
  return conversation
})

export const setTypingAction = withAction(
  async (conversationId: string, input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(setTypingSchema, input)
    return messagingService.setTyping(ctx, conversationId, parsed)
  }
)

export const toggleMuteAction = withAction(
  async (conversationId: string, muted?: boolean) => {
    const ctx = await getRequestContext()
    await parseLocalized(muteSchema, { muted })
    const conversation = await messagingService.toggleMute(
      ctx,
      conversationId,
      muted
    )
    await revalidateOrgPath(ctx.organizationId)
    return conversation
  }
)

export const togglePinAction = withAction(
  async (conversationId: string, pinned?: boolean) => {
    const ctx = await getRequestContext()
    await parseLocalized(pinSchema, { pinned })
    const conversation = await messagingService.togglePin(
      ctx,
      conversationId,
      pinned
    )
    await revalidateOrgPath(ctx.organizationId)
    return conversation
  }
)
