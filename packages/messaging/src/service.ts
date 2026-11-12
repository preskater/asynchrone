import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import type { Readable } from "node:stream"
import {
  decodeCursor,
  encodeCursor,
  pageSize,
  toPage,
  type Page,
  type PageInput,
} from "@workspace/core/pagination"
import { can } from "@workspace/organization/roles"

import type { MessagingStorage } from "./deps"
import { MessagingRepository } from "./repository"
import type {
  AddThreadReplyInput,
  CreateChannelInput,
  EditMessageInput,
  SendMessageInput,
  SetTypingInput,
  StartDmInput,
  ToggleReactionInput,
} from "./schemas"
import type {
  Conversation,
  Message,
  MessagingData,
  Presence,
  Reaction,
  Team,
} from "./types"

function canWrite(ctx: RequestContext) {
  if (can(ctx, "message:write")) return
  throw new ForbiddenError("Your role cannot send messages.", {
    code: "role_cannot_send_messages",
  })
}

/** Only the author (or an admin/owner) may edit or delete a message. */
function assertAuthor(ctx: RequestContext, authorId: string) {
  if (authorId === ctx.userId || can(ctx, "message:moderate")) return
  throw new ForbiddenError("You can only modify your own messages.", {
    code: "message_not_author",
  })
}

type ConversationRow = Awaited<
  ReturnType<MessagingRepository["listConversations"]>
>[number]
type MessageRow = Awaited<
  ReturnType<MessagingRepository["listMessagesForConversation"]>
>[number]
type ReplyRow = Awaited<ReturnType<MessagingRepository["listReplies"]>>[number]
type TeamRow = Awaited<ReturnType<MessagingRepository["listTeams"]>>[number]

export interface MessagingAuditInput {
  action: string
  entityType: string
  entityId: string
  entityLabel?: string | null
  before?: unknown
  after?: unknown
}

export type MessagingAudit = (
  ctx: RequestContext,
  input: MessagingAuditInput
) => Promise<void>

/** What the owning app binds: the large objects and the audit writer. */
export interface MessagingServiceDeps {
  storage: MessagingStorage
  audit?: MessagingAudit
}

export class MessagingService {
  private readonly storage: MessagingStorage
  private readonly audit?: MessagingAudit

  constructor(
    private readonly repo: MessagingRepository,
    deps: MessagingServiceDeps
  ) {
    this.storage = deps.storage
    this.audit = deps.audit
  }

  private record(
    ctx: RequestContext,
    input: MessagingAuditInput
  ): Promise<void> {
    return this.audit ? this.audit(ctx, input) : Promise.resolve()
  }

  private mapConversation(row: ConversationRow): Conversation {
    return {
      id: row.id,
      kind: row.kind as Conversation["kind"],
      name: row.name,
      teamId: row.teamId ?? undefined,
      memberIds: row.members.map((member) => member.userId),
      topic: row.topic ?? undefined,
      unreadCount: row.unreadCount,
      lastMessageAt: row.lastMessageAt.toISOString(),
      muted: row.muted,
      pinned: row.pinned,
    }
  }

  private mapMessage(row: MessageRow | ReplyRow): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      authorId: row.authorId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      reactions: this.mapReactions(row),
      attachments: row.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        kind: attachment.kind as Message["attachments"][number]["kind"],
        meta: attachment.meta ?? undefined,
        sizeBytes: attachment.sizeBytes ?? undefined,
        hasStorage: attachment.oid !== null,
      })),
      parentId: row.parentId ?? undefined,
      edited: row.edited,
      system: row.system,
      meeting: row.meetingTitle
        ? {
            title: row.meetingTitle,
            startsAt: (row.meetingStartsAt ?? row.createdAt).toISOString(),
            durationMinutes: row.meetingDuration ?? 30,
          }
        : undefined,
    }
  }

  private mapReactions(row: {
    reactions: MessageRow["reactions"]
  }): Reaction[] {
    const grouped = new Map<string, string[]>()
    for (const reaction of row.reactions) {
      grouped.set(reaction.emoji, [
        ...(grouped.get(reaction.emoji) ?? []),
        reaction.userId,
      ])
    }
    return Array.from(grouped, ([emoji, memberIds]) => ({ emoji, memberIds }))
  }

  private mapTeam(row: TeamRow): Team {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      channelIds: row.conversations.map((conversation) => conversation.id),
    }
  }

  /**
   * Shell payload: conversations, teams and presence. Messages are loaded per
   * conversation through `listMessages` so the layout never scans the whole
   * message table.
   */
  async list(ctx: RequestContext): Promise<MessagingData> {
    const [conversations, teams, latestMessages, onlineUsers] =
      await Promise.all([
        this.repo.listConversations(ctx.organizationId),
        this.repo.listTeams(ctx.organizationId),
        this.repo.listLatestMessages(ctx.organizationId),
        this.repo.listPresenceCandidates(ctx.organizationId),
      ])
    const now = Date.now()
    const presence: Record<string, Presence> = {}
    for (const entry of onlineUsers) {
      const lastSeen = entry.lastSeenAt?.getTime()
      if (!lastSeen) continue
      const minutes = (now - lastSeen) / 60000
      presence[entry.userId] =
        minutes < 2 ? "online" : minutes < 15 ? "away" : "offline"
    }
    const typing: Record<string, string[]> = {}
    return {
      teams: teams.map((team) => this.mapTeam(team)),
      conversations: conversations.map((conversation) =>
        this.mapConversation(conversation)
      ),
      // Previews only. The conversation screen replaces these with a bounded
      // page through `listMessages`.
      messages: latestMessages.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        authorId: row.authorId,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        reactions: [],
        attachments: [],
      })),
      presence,
      typing,
    }
  }

  /**
   * One bounded page of a conversation, newest page first by default.
   * Thread replies are flattened after their parent so the client store keeps
   * working with a single message array.
   */
  async listMessages(
    ctx: RequestContext,
    conversationId: string,
    input: PageInput = {}
  ): Promise<Page<Message>> {
    const conversation = await this.repo.findConversation(
      ctx.organizationId,
      conversationId
    )
    if (!conversation) throw new NotFoundError("Conversation")

    const limit = pageSize(input.limit, 50)
    const decoded = decodeCursor(input.cursor)
    const before =
      decoded && decoded[0] && decoded[1]
        ? { createdAt: new Date(decoded[0]), id: decoded[1] }
        : null
    const rows = await this.repo.listMessagesForConversation(
      ctx.organizationId,
      conversationId,
      { before, take: limit + 1 }
    )
    const page = toPage(rows, limit, (row) =>
      encodeCursor([row.createdAt.toISOString(), row.id])
    )
    // Newest-first query, oldest-first rendering; replies stay after parents.
    const ordered = [...page.items].reverse()
    const items: Message[] = []
    for (const row of ordered) {
      items.push(this.mapMessage(row))
      for (const reply of [...row.replies].reverse()) {
        items.push(this.mapMessage(reply))
      }
    }
    return { items, nextCursor: page.nextCursor }
  }

  async listConversations(ctx: RequestContext): Promise<Conversation[]> {
    const rows = await this.repo.listConversations(ctx.organizationId)
    return rows.map((row) => this.mapConversation(row))
  }

  async messagesFor(
    ctx: RequestContext,
    conversationId: string
  ): Promise<Message[]> {
    const page = await this.listMessages(ctx, conversationId)
    return page.items
  }

  async listThreadReplies(
    ctx: RequestContext,
    messageId: string
  ): Promise<Message[]> {
    const parent = await this.repo.findMessage(ctx.organizationId, messageId)
    if (!parent) throw new NotFoundError("Message")
    const rows = await this.repo.listReplies(ctx.organizationId, messageId)
    return rows.map((row) => this.mapMessage(row))
  }

  async sendMessage(
    ctx: RequestContext,
    input: SendMessageInput
  ): Promise<Message> {
    canWrite(ctx)
    const conversation = await this.repo.findConversation(
      ctx.organizationId,
      input.conversationId
    )
    if (!conversation) throw new NotFoundError("Conversation")

    const row = await this.repo.createMessage({
      conversationId: input.conversationId,
      authorId: ctx.userId,
      body: input.body,
      parentId: input.parentId,
      meetingTitle: input.meeting?.title,
      meetingStartsAt: input.meeting
        ? new Date(input.meeting.startsAt)
        : undefined,
      meetingDuration: input.meeting?.durationMinutes,
      attachments: input.attachments?.map((attachment) => ({
        name: attachment.name,
        kind: attachment.kind,
        meta: attachment.meta,
        oid: attachment.oid,
        mimeType: attachment.mimeType,
        sha256: attachment.sha256,
        sizeBytes: attachment.sizeBytes,
      })),
    })
    if (!input.parentId) {
      await this.repo.updateConversation(input.conversationId, {
        lastMessageAt: new Date(),
        unreadCount: 0,
      })
    }
    const message = this.mapMessage(row)
    await this.record(ctx, {
      action: "message.sent",
      entityType: "message",
      entityId: message.id,
      entityLabel: message.body.slice(0, 120),
      after: { conversationId: message.conversationId },
    })
    return message
  }

  async editMessage(
    ctx: RequestContext,
    id: string,
    input: EditMessageInput
  ): Promise<Message> {
    canWrite(ctx)
    const existing = await this.repo.findMessage(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Message")
    assertAuthor(ctx, existing.authorId)
    const row = await this.repo.updateMessage(id, {
      body: input.body,
      edited: true,
    })
    const message = this.mapMessage(row)
    await this.record(ctx, {
      action: "message.edited",
      entityType: "message",
      entityId: message.id,
      entityLabel: message.body.slice(0, 120),
    })
    return message
  }

  async deleteMessage(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    canWrite(ctx)
    const existing = await this.repo.findMessage(ctx.organizationId, id)
    if (!existing) throw new NotFoundError("Message")
    assertAuthor(ctx, existing.authorId)
    const oids = existing.attachments
      .map((attachment) => attachment.oid)
      .filter((oid): oid is bigint => oid !== null)
    await this.repo.deleteMessage(id)
    await Promise.all(
      oids.map((oid) =>
        this.storage
          .unlink(Number(oid))
          .catch((error) =>
            console.error(
              `[messaging] failed to unlink large object ${oid}`,
              error
            )
          )
      )
    )
    await this.record(ctx, {
      action: "message.deleted",
      entityType: "message",
      entityId: id,
    })
    return { id }
  }

  async toggleReaction(
    ctx: RequestContext,
    messageId: string,
    input: ToggleReactionInput
  ): Promise<Message> {
    canWrite(ctx)
    const existing = await this.repo.findMessage(ctx.organizationId, messageId)
    if (!existing) throw new NotFoundError("Message")
    await this.repo.toggleReaction(messageId, input.emoji, ctx.userId)
    const row = await this.repo.findMessage(ctx.organizationId, messageId)
    const message = this.mapMessage(row ?? existing)
    await this.record(ctx, {
      action: "message.reaction.toggled",
      entityType: "message",
      entityId: messageId,
      after: { emoji: input.emoji },
    })
    return message
  }

  async addThreadReply(
    ctx: RequestContext,
    input: AddThreadReplyInput
  ): Promise<Message> {
    canWrite(ctx)
    const parent = await this.repo.findMessage(
      ctx.organizationId,
      input.parentId
    )
    if (!parent) throw new NotFoundError("Message")
    const row = await this.repo.createMessage({
      conversationId: parent.conversationId,
      authorId: ctx.userId,
      body: input.body,
      parentId: parent.id,
    })
    const reply = this.mapMessage(row)
    await this.record(ctx, {
      action: "message.replied",
      entityType: "message",
      entityId: reply.id,
      after: { parentId: reply.parentId ?? null },
    })
    return reply
  }

  async markRead(
    ctx: RequestContext,
    conversationId: string
  ): Promise<Conversation | null> {
    const conversation = await this.repo.findConversation(
      ctx.organizationId,
      conversationId
    )
    if (!conversation) return null
    if (conversation.unreadCount === 0)
      return this.mapConversation(conversation)
    const row = await this.repo.updateConversation(conversationId, {
      unreadCount: 0,
    })
    return this.mapConversation(row)
  }

  async startDirectMessage(
    ctx: RequestContext,
    input: StartDmInput
  ): Promise<Conversation> {
    canWrite(ctx)
    const existing = await this.repo.findDm(
      ctx.organizationId,
      ctx.userId,
      input.memberId
    )
    if (existing) return this.mapConversation(existing)

    const memberName = await this.repo.findMemberName(
      ctx.organizationId,
      input.memberId
    )
    const name = memberName ?? ctx.userName
    const row = await this.repo.createConversation({
      organizationId: ctx.organizationId,
      kind: "dm",
      name,
      memberIds: [ctx.userId, input.memberId],
    })
    const conversation = this.mapConversation(row)
    await this.record(ctx, {
      action: "conversation.created",
      entityType: "conversation",
      entityId: conversation.id,
      entityLabel: conversation.name,
      after: { kind: "dm" },
    })
    return conversation
  }

  async createChannel(
    ctx: RequestContext,
    input: CreateChannelInput
  ): Promise<Conversation> {
    canWrite(ctx)
    const team = await this.repo.findTeam(ctx.organizationId, input.teamId)
    if (!team) throw new NotFoundError("Team")
    const row = await this.repo.createConversation({
      organizationId: ctx.organizationId,
      kind: "channel",
      name: input.name,
      teamId: input.teamId,
      topic: input.topic,
      memberIds: [ctx.userId],
    })
    return this.mapConversation(row)
  }

  async toggleMute(
    ctx: RequestContext,
    conversationId: string,
    muted?: boolean
  ): Promise<Conversation> {
    canWrite(ctx)
    const existing = await this.repo.findConversation(
      ctx.organizationId,
      conversationId
    )
    if (!existing) throw new NotFoundError("Conversation")
    const row = await this.repo.updateConversation(conversationId, {
      muted: muted ?? !existing.muted,
    })
    return this.mapConversation(row)
  }

  async togglePin(
    ctx: RequestContext,
    conversationId: string,
    pinned?: boolean
  ): Promise<Conversation> {
    canWrite(ctx)
    const existing = await this.repo.findConversation(
      ctx.organizationId,
      conversationId
    )
    if (!existing) throw new NotFoundError("Conversation")
    const row = await this.repo.updateConversation(conversationId, {
      pinned: pinned ?? !existing.pinned,
    })
    return this.mapConversation(row)
  }

  async listTeams(ctx: RequestContext): Promise<Team[]> {
    const rows = await this.repo.listTeams(ctx.organizationId)
    return rows.map((row) => this.mapTeam(row))
  }

  setTyping(
    ctx: RequestContext,
    conversationId: string,
    input: SetTypingInput
  ): { ok: true } {
    return { ok: true }
  }

  async touchPresence(ctx: RequestContext): Promise<void> {
    await this.repo.touchPresence(ctx.userId)
  }

  /**
   * Open one attachment's bytes for download. The organization scope is part of
   * the lookup, so an attachment id from another organization is a 404.
   */
  async openAttachment(
    ctx: RequestContext,
    attachmentId: string
  ): Promise<{
    name: string
    mimeType: string
    size: number
    stream: Readable
  } | null> {
    const attachment = await this.repo.findAttachment(
      ctx.organizationId,
      attachmentId
    )
    if (!attachment || attachment.oid === null) return null
    const { size, stream } = await this.storage.open(Number(attachment.oid))
    return {
      name: attachment.name,
      mimeType: attachment.mimeType ?? "application/octet-stream",
      size,
      stream,
    }
  }
}
