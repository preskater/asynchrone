import type { PrismaClient } from "@workspace/db"

/**
 * The slice of a Prisma client the messaging domain needs.
 *
 * The package never opens a connection: the owning app binds its own client.
 * `apps/messages` owns the screens since #162 but still binds the shared
 * monolith client (the documented transitional binding) because of the
 * identity reads below; `apps/copilot` keeps an in-process binding for the
 * assistant, MCP and search until #190.
 *
 * `member` and `user` are identity tables the presence indicator and the DM
 * title still read directly. They move behind the identity internal API when
 * the domain moves to `asynchrone_messages`; until then the structural port
 * keeps the dependency explicit (#171/#190).
 */
export type MessagingDb = Pick<
  PrismaClient,
  | "chatTeam"
  | "conversation"
  | "message"
  | "messageReaction"
  | "messageAttachment"
  | "member"
  | "user"
  | "$transaction"
  | "$queryRaw"
>

/** Thread replies are bounded: only the latest replies of a message load. */
export const messageInclude = {
  reactions: true,
  attachments: true,
  replies: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: { reactions: true, attachments: true },
  },
}

export class MessagingRepository {
  constructor(private readonly db: MessagingDb) {}

  listConversations(organizationId: string) {
    return this.db.conversation.findMany({
      where: { organizationId },
      include: { members: true },
      orderBy: { lastMessageAt: "desc" },
    })
  }

  findConversation(organizationId: string, id: string) {
    return this.db.conversation.findFirst({
      where: { id, organizationId },
      include: { members: true },
    })
  }

  findDm(organizationId: string, currentUserId: string, partnerId: string) {
    return this.db.conversation.findFirst({
      where: {
        organizationId,
        kind: "dm",
        AND: [
          { members: { some: { userId: currentUserId } } },
          { members: { some: { userId: partnerId } } },
        ],
      },
      include: { members: true },
    })
  }

  createConversation(data: {
    organizationId: string
    kind: string
    name: string
    teamId?: string | null
    topic?: string
    memberIds: string[]
  }) {
    return this.db.conversation.create({
      data: {
        organizationId: data.organizationId,
        kind: data.kind,
        name: data.name,
        teamId: data.teamId ?? null,
        topic: data.topic,
        members: { create: data.memberIds.map((userId) => ({ userId })) },
      },
      include: { members: true },
    })
  }

  updateConversation(
    id: string,
    data: {
      unreadCount?: number
      muted?: boolean
      pinned?: boolean
      lastMessageAt?: Date
    }
  ) {
    return this.db.conversation.update({
      where: { id },
      data,
      include: { members: true },
    })
  }

  listTeams(organizationId: string) {
    return this.db.chatTeam.findMany({
      where: { organizationId },
      include: { conversations: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    })
  }

  findTeam(organizationId: string, id: string) {
    return this.db.chatTeam.findFirst({
      where: { id, organizationId },
      include: { conversations: { select: { id: true } } },
    })
  }

  /**
   * Top-level messages of one conversation, newest first. Callers request one
   * extra row to detect whether an older page exists.
   */
  listMessagesForConversation(
    organizationId: string,
    conversationId: string,
    options: {
      before?: { createdAt: Date; id: string } | null
      take: number
    }
  ) {
    return this.db.message.findMany({
      where: {
        conversationId,
        parentId: null,
        conversation: { organizationId },
        ...(options.before
          ? {
              OR: [
                { createdAt: { lt: options.before.createdAt } },
                {
                  createdAt: options.before.createdAt,
                  id: { lt: options.before.id },
                },
              ],
            }
          : {}),
      },
      include: messageInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: options.take,
    })
  }

  /** One latest top-level message per conversation (list previews). */
  listLatestMessages(organizationId: string) {
    return this.db.$queryRaw<
      {
        id: string
        conversationId: string
        authorId: string
        body: string
        createdAt: Date
      }[]
    >`
      SELECT DISTINCT ON (m."conversationId")
             m.id,
             m."conversationId",
             m."authorId",
             m.body,
             m."createdAt"
      FROM "message" m
      INNER JOIN "conversation" c ON c.id = m."conversationId"
      WHERE c."organizationId" = ${organizationId}
        AND m."parentId" IS NULL
      ORDER BY m."conversationId", m."createdAt" DESC
    `
  }

  findMessage(organizationId: string, id: string) {
    return this.db.message.findFirst({
      where: { id, conversation: { organizationId } },
      include: messageInclude,
    })
  }

  listReplies(organizationId: string, parentId: string, take = 100) {
    return this.db.message.findMany({
      where: {
        parentId,
        conversation: { organizationId },
      },
      include: { reactions: true, attachments: true },
      orderBy: { createdAt: "asc" },
      take,
    })
  }

  createMessage(data: {
    conversationId: string
    authorId: string
    body: string
    parentId?: string | null
    meetingTitle?: string
    meetingStartsAt?: Date
    meetingDuration?: number
    attachments?: {
      name: string
      kind: string
      meta?: string
      oid?: number
      mimeType?: string
      sha256?: string
      sizeBytes?: number
    }[]
  }) {
    return this.db.message.create({
      data: {
        conversationId: data.conversationId,
        authorId: data.authorId,
        body: data.body,
        parentId: data.parentId ?? null,
        meetingTitle: data.meetingTitle,
        meetingStartsAt: data.meetingStartsAt,
        meetingDuration: data.meetingDuration,
        attachments: data.attachments?.length
          ? {
              create: data.attachments.map((attachment) => ({
                name: attachment.name,
                kind: attachment.kind,
                meta: attachment.meta,
                oid: attachment.oid,
                mimeType: attachment.mimeType,
                sha256: attachment.sha256,
                sizeBytes: attachment.sizeBytes,
              })),
            }
          : undefined,
      },
      include: messageInclude,
    })
  }

  updateMessage(id: string, data: { body?: string; edited?: boolean }) {
    return this.db.message.update({
      where: { id },
      data,
      include: messageInclude,
    })
  }

  deleteMessage(id: string) {
    return this.db.message.delete({ where: { id } })
  }

  toggleReaction(messageId: string, emoji: string, userId: string) {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.messageReaction.findUnique({
        where: { messageId_emoji_userId: { messageId, emoji, userId } },
      })
      if (existing) {
        await tx.messageReaction.delete({ where: { id: existing.id } })
        return false
      }
      await tx.messageReaction.create({ data: { messageId, emoji, userId } })
      return true
    })
  }

  /** One attachment of a conversation in this organization. */
  findAttachment(organizationId: string, attachmentId: string) {
    return this.db.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        oid: { not: null },
        message: { conversation: { organizationId } },
      },
      select: { id: true, name: true, mimeType: true, oid: true },
    })
  }

  /** Every organization member, for the coarse presence indicator. */
  listPresenceCandidates(organizationId: string) {
    return this.db.member.findMany({
      where: { organizationId, clientId: null },
      select: { userId: true, user: { select: { lastSeenAt: true } } },
    })
  }

  /** The display name a direct message is titled with. */
  findMemberName(organizationId: string, userId: string) {
    return this.db.member.findFirst({
      where: { organizationId, userId },
      select: { user: { select: { name: true } } },
    })
  }

  touchPresence(userId: string) {
    return this.db.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    })
  }
}
