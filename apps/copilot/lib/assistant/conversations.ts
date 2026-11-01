import type { AssistantConversationSummary } from "@workspace/ai/conversations"
import type { AssistantPart, ChatMessage } from "@workspace/ai/chat"
import type { RequestContext } from "@workspace/core/context"
import { NotFoundError } from "@workspace/core/errors"
import type { Prisma } from "@workspace/db"

import {
  MAX_HISTORY_MESSAGES,
  MAX_RECENT_MESSAGES,
  titleFromText,
  toChatMessages,
} from "@/lib/assistant/history"
import { prisma } from "@/lib/prisma"

/**
 * Server-owned assistant history.
 *
 * The client sends only the new text and the conversation id; the model input
 * is rebuilt here from what the server stored. Every query is scoped to both
 * the active organization and the signed-in user, so a conversation id from
 * another organization or another member is indistinguishable from a missing
 * one.
 */

export {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_RECENT_MESSAGES,
} from "@/lib/assistant/history"

export interface AssistantTurn {
  conversationId: string
  /** Stored turns that came before the message being sent. */
  history: ChatMessage[]
}

export interface AssistantConversationView {
  id: string
  title: string
  messages: ChatMessage[]
}

/** The home screen shows recent conversations, not the whole history. */
export const MAX_CONVERSATIONS = 100

const messageSelect = { id: true, role: true, parts: true } as const
const summarySelect = { id: true, title: true, updatedAt: true } as const

/** Newest stored turn first, so `take` keeps the most recent history. */
const newestFirst = [{ createdAt: "desc" as const }, { id: "desc" as const }]

function ownedBy(ctx: RequestContext, id: string) {
  return { id, organizationId: ctx.organizationId, userId: ctx.userId }
}

function toSummary(conversation: {
  id: string
  title: string
  updatedAt: Date
}): AssistantConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt.toISOString(),
  }
}

/**
 * The signed-in user's conversations in the active organization, newest
 * first. Another member's conversations never appear, even in the same
 * organization.
 */
export async function listConversations(
  ctx: RequestContext
): Promise<AssistantConversationSummary[]> {
  const conversations = await prisma.assistantConversation.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: MAX_CONVERSATIONS,
    select: summarySelect,
  })
  return conversations.map(toSummary)
}

/**
 * Creates an empty conversation so "New chat" has a stable id to reopen after
 * a reload. The title stays empty until the first user message derives it.
 */
export async function createConversation(
  ctx: RequestContext
): Promise<AssistantConversationSummary> {
  const conversation = await prisma.assistantConversation.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    select: summarySelect,
  })
  return toSummary(conversation)
}

/**
 * Deletes one conversation and, through the schema cascade, its messages.
 * Foreign, unknown and already-deleted ids are the same `404`.
 */
export async function deleteConversation(
  ctx: RequestContext,
  conversationId: string
): Promise<void> {
  const deleted = await prisma.assistantConversation.deleteMany({
    where: ownedBy(ctx, conversationId),
  })
  if (deleted.count === 0) throw new NotFoundError("Conversation")
}

/** Loads one conversation for a reload, rejecting foreign ids. */
export async function loadConversation(
  ctx: RequestContext,
  conversationId: string
): Promise<AssistantConversationView> {
  const conversation = await prisma.assistantConversation.findFirst({
    where: ownedBy(ctx, conversationId),
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: newestFirst,
        take: MAX_RECENT_MESSAGES,
        select: messageSelect,
      },
    },
  })
  if (!conversation) throw new NotFoundError("Conversation")

  return {
    id: conversation.id,
    title: conversation.title,
    messages: toChatMessages(conversation.messages.slice().reverse()),
  }
}

/**
 * Resolves (or creates) the conversation, loads the history the model will see
 * and persists the accepted user message. Throws before the model is called
 * when the id belongs to someone else.
 */
export async function beginTurn(
  ctx: RequestContext,
  input: { conversationId?: string; text: string }
): Promise<AssistantTurn> {
  const existing = input.conversationId
    ? await prisma.assistantConversation.findFirst({
        where: ownedBy(ctx, input.conversationId),
        select: {
          id: true,
          messages: {
            orderBy: newestFirst,
            take: MAX_HISTORY_MESSAGES,
            select: messageSelect,
          },
        },
      })
    : null
  if (input.conversationId && !existing) throw new NotFoundError("Conversation")

  const conversation =
    existing ??
    (await prisma.assistantConversation.create({
      data: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        title: titleFromText(input.text),
      },
      select: { id: true },
    }))

  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        parts: [{ type: "text", text: input.text }] as Prisma.InputJsonValue,
      },
    }),
    prisma.assistantConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    }),
  ])

  return {
    conversationId: conversation.id,
    history: toChatMessages(
      existing ? existing.messages.slice().reverse() : []
    ),
  }
}

/**
 * Persists the assistant turn once the stream completed. Never called for an
 * aborted or failed stream, so a run that broke halfway leaves the accepted
 * user message and no half-written answer.
 */
export async function completeTurn(
  ctx: RequestContext,
  conversationId: string,
  parts: AssistantPart[]
): Promise<void> {
  if (parts.length === 0) return

  const owned = await prisma.assistantConversation.updateMany({
    where: ownedBy(ctx, conversationId),
    data: { updatedAt: new Date() },
  })
  // The conversation was deleted while the model was running; nothing to save.
  if (owned.count === 0) return

  await prisma.assistantMessage.create({
    data: {
      conversationId,
      role: "assistant",
      parts: parts as Prisma.InputJsonValue,
    },
  })
}
