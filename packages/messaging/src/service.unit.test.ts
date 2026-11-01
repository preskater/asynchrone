import { PassThrough } from "node:stream"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { MessagingStorage } from "./deps"
import type { MessagingRepository } from "./repository"
import { MessagingService } from "./service"

const ctxA: RequestContext = {
  userId: "user_a",
  userName: "Alice",
  userEmail: "alice@example.com",
  organizationId: "org_a",
  role: "owner",
}

const ctxB: RequestContext = {
  ...ctxA,
  userId: "user_b",
  userName: "Mallory",
  organizationId: "org_b",
}

const createdAt = new Date("2026-10-30T10:00:00Z")

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv_a",
    organizationId: "org_a",
    kind: "channel",
    name: "general",
    teamId: null,
    topic: "Everything",
    unreadCount: 3,
    lastMessageAt: createdAt,
    muted: false,
    pinned: false,
    createdAt,
    members: [{ userId: "user_a" }, { userId: "user_b" }],
    ...overrides,
  }
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_a",
    conversationId: "conv_a",
    authorId: "user_a",
    body: "hello",
    createdAt,
    updatedAt: createdAt,
    edited: false,
    system: false,
    parentId: null,
    meetingTitle: null,
    meetingStartsAt: null,
    meetingDuration: null,
    reactions: [] as { emoji: string; userId: string }[],
    attachments: [] as {
      id: string
      name: string
      kind: string
      meta: string | null
      oid: bigint | null
      mimeType: string | null
      sha256: string | null
      sizeBytes: number | null
    }[],
    replies: [] as unknown[],
    ...overrides,
  }
}

function buildService() {
  const conversation = conversationRow()
  const repo = {
    listConversations: vi.fn(async () => [conversation]),
    findConversation: vi.fn(async (organizationId: string, id: string) =>
      organizationId === conversation.organizationId && id === conversation.id
        ? conversation
        : null
    ),
    findDm: vi.fn(async () => null as unknown),
    createConversation: vi.fn(async () => conversation),
    updateConversation: vi.fn(
      async (_id: string, data: Record<string, unknown>) =>
        conversationRow(data)
    ),
    listTeams: vi.fn(async () => []),
    findTeam: vi.fn(async () => null as unknown),
    listMessagesForConversation: vi.fn(async () => [] as unknown[]),
    listLatestMessages: vi.fn(async () => []),
    findMessage: vi.fn(async () => messageRow() as unknown),
    listReplies: vi.fn(async () => [] as unknown[]),
    createMessage: vi.fn(async () => messageRow() as unknown),
    updateMessage: vi.fn(async () => messageRow({ edited: true }) as unknown),
    deleteMessage: vi.fn(async () => undefined),
    toggleReaction: vi.fn(async () => true),
    findAttachment: vi.fn(async () => null as unknown),
    listPresenceCandidates: vi.fn(async () => [
      { userId: "user_a", user: { lastSeenAt: createdAt } },
    ]),
    findMemberName: vi.fn(async () => ({ user: { name: "Bob" } })),
    touchPresence: vi.fn(async () => undefined),
  }
  const storage: MessagingStorage = {
    open: vi.fn(async () => ({ size: 5, stream: new PassThrough() })),
    unlink: vi.fn(async () => undefined),
  }
  const service = new MessagingService(repo as unknown as MessagingRepository, {
    storage,
  })
  return { repo, storage, service, conversation }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("MessagingService membership and organization scope", () => {
  it("maps conversation membership, unread state and pin/mute flags", async () => {
    const { service } = buildService()

    const conversations = await service.listConversations(ctxA)

    expect(conversations).toEqual([
      {
        id: "conv_a",
        kind: "channel",
        name: "general",
        teamId: undefined,
        memberIds: ["user_a", "user_b"],
        topic: "Everything",
        unreadCount: 3,
        lastMessageAt: createdAt.toISOString(),
        muted: false,
        pinned: false,
      },
    ])
  })

  it("scopes every conversation read to the caller's organization", async () => {
    const { repo, service } = buildService()

    await service.listConversations(ctxB)

    expect(repo.listConversations).toHaveBeenCalledWith("org_b")
  })

  it("refuses to send into a conversation from another organization", async () => {
    const { repo, service } = buildService()

    await expect(
      service.sendMessage(ctxB, { conversationId: "conv_a", body: "hi" })
    ).rejects.toMatchObject({
      message: expect.stringContaining("Conversation"),
    })
    expect(repo.createMessage).not.toHaveBeenCalled()
  })

  it("returns the existing direct message with its membership untouched", async () => {
    const { repo, service } = buildService()
    repo.findDm.mockResolvedValue(
      conversationRow({
        id: "dm_1",
        kind: "dm",
        name: "Bob",
        memberIds: undefined,
        members: [{ userId: "user_a" }, { userId: "user_b" }],
      }) as never
    )

    const conversation = await service.startDirectMessage(ctxA, {
      memberId: "user_b",
    })

    expect(conversation.kind).toBe("dm")
    expect(conversation.memberIds).toEqual(["user_a", "user_b"])
    expect(repo.createConversation).not.toHaveBeenCalled()
  })

  it("creates a direct message with both participants", async () => {
    const { repo, service } = buildService()
    repo.createConversation.mockResolvedValue(
      conversationRow({
        id: "dm_2",
        kind: "dm",
        name: "Bob",
        members: [{ userId: "user_a" }, { userId: "user_b" }],
      }) as never
    )

    const conversation = await service.startDirectMessage(ctxA, {
      memberId: "user_b",
    })

    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_a",
        kind: "dm",
        memberIds: ["user_a", "user_b"],
      })
    )
    expect(conversation.memberIds).toEqual(["user_a", "user_b"])
  })

  it("creates a channel with the author as its first member", async () => {
    const { repo, service } = buildService()
    repo.findTeam.mockResolvedValue({
      id: "team_1",
      conversations: [],
    } as never)
    repo.createConversation.mockResolvedValue(
      conversationRow({ id: "chan_2", name: "design" }) as never
    )

    await service.createChannel(ctxA, { teamId: "team_1", name: "design" })

    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_a",
        kind: "channel",
        teamId: "team_1",
        memberIds: ["user_a"],
      })
    )
  })

  it("only lets writers send and only lets authors or admins edit", async () => {
    const { service } = buildService()
    const member: RequestContext = { ...ctxA, userId: "user_b", role: "member" }

    await expect(
      service.sendMessage(
        { ...member, role: "viewer" },
        {
          conversationId: "conv_a",
          body: "hi",
        }
      )
    ).rejects.toMatchObject({ code: "role_cannot_send_messages" })

    await expect(
      service.editMessage(member, "msg_a", { body: "edited" })
    ).rejects.toMatchObject({ code: "message_not_author" })
  })
})

describe("MessagingService unread state and threads", () => {
  it("resets unread state when the conversation is marked read", async () => {
    const { repo, service } = buildService()

    const conversation = await service.markRead(ctxA, "conv_a")

    expect(repo.updateConversation).toHaveBeenCalledWith("conv_a", {
      unreadCount: 0,
    })
    expect(conversation?.unreadCount).toBe(0)
  })

  it("skips the write when there is nothing unread", async () => {
    const { repo, service } = buildService()
    repo.findConversation.mockResolvedValue(conversationRow({ unreadCount: 0 }))

    await service.markRead(ctxA, "conv_a")

    expect(repo.updateConversation).not.toHaveBeenCalled()
  })

  it("bumps the conversation on a top-level message but not on a reply", async () => {
    const { repo, service } = buildService()

    await service.sendMessage(ctxA, { conversationId: "conv_a", body: "hi" })
    expect(repo.updateConversation).toHaveBeenCalledWith(
      "conv_a",
      expect.objectContaining({ unreadCount: 0 })
    )

    repo.updateConversation.mockClear()
    await service.addThreadReply(ctxA, { parentId: "msg_a", body: "reply" })
    expect(repo.updateConversation).not.toHaveBeenCalled()
    expect(repo.createMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ conversationId: "conv_a", parentId: "msg_a" })
    )
  })

  it("flattens thread replies after their parent", async () => {
    const { repo, service } = buildService()
    const reply = messageRow({
      id: "msg_reply",
      body: "reply",
      parentId: "msg_a",
      createdAt: new Date("2026-10-30T10:01:00Z"),
    })
    repo.listMessagesForConversation.mockResolvedValue([
      messageRow({ replies: [reply] }),
    ])

    const page = await service.listMessages(ctxA, "conv_a")

    expect(page.items.map((message) => message.id)).toEqual([
      "msg_a",
      "msg_reply",
    ])
    expect(repo.listMessagesForConversation).toHaveBeenCalledWith(
      "org_a",
      "conv_a",
      expect.objectContaining({ take: expect.any(Number) })
    )
  })

  it("returns reactions grouped by emoji with their member ids", async () => {
    const { repo, service } = buildService()
    repo.listMessagesForConversation.mockResolvedValue([
      messageRow({
        reactions: [
          { emoji: "👍", userId: "user_a" },
          { emoji: "👍", userId: "user_b" },
          { emoji: "🎉", userId: "user_b" },
        ],
      }),
    ])

    const page = await service.listMessages(ctxA, "conv_a")

    expect(page.items[0]?.reactions).toEqual([
      { emoji: "👍", memberIds: ["user_a", "user_b"] },
      { emoji: "🎉", memberIds: ["user_b"] },
    ])
  })
})

describe("MessagingService attachments", () => {
  it("stores attachment metadata on the message (upload path)", async () => {
    const { repo, service } = buildService()
    repo.createMessage.mockResolvedValue(
      messageRow({
        attachments: [
          {
            id: "att_1",
            name: "plan.png",
            kind: "image",
            meta: "image/png",
            oid: 42n,
            mimeType: "image/png",
            sha256: "hash",
            sizeBytes: 10,
          },
        ],
      }) as never
    )

    const message = await service.sendMessage(ctxA, {
      conversationId: "conv_a",
      body: "see attached",
      attachments: [
        {
          name: "plan.png",
          kind: "image",
          oid: 42,
          mimeType: "image/png",
          sha256: "hash",
          sizeBytes: 10,
        },
      ],
    })

    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            name: "plan.png",
            kind: "image",
            oid: 42,
            mimeType: "image/png",
            sha256: "hash",
            sizeBytes: 10,
          }),
        ],
      })
    )
    expect(message.attachments).toEqual([
      {
        id: "att_1",
        name: "plan.png",
        kind: "image",
        meta: "image/png",
        sizeBytes: 10,
        hasStorage: true,
      },
    ])
  })

  it("streams an attachment of the caller's organization (download path)", async () => {
    const { repo, storage, service } = buildService()
    repo.findAttachment.mockResolvedValue({
      id: "att_1",
      name: "plan.png",
      mimeType: "image/png",
      oid: 42n,
    } as never)

    const attachment = await service.openAttachment(ctxA, "att_1")

    expect(repo.findAttachment).toHaveBeenCalledWith("org_a", "att_1")
    expect(storage.open).toHaveBeenCalledWith(42)
    expect(attachment).toMatchObject({
      name: "plan.png",
      mimeType: "image/png",
      size: 5,
    })
  })

  it("hides an attachment that belongs to another organization", async () => {
    const { repo, storage, service } = buildService()
    repo.findAttachment.mockResolvedValue(null)

    const attachment = await service.openAttachment(ctxB, "att_1")

    expect(repo.findAttachment).toHaveBeenCalledWith("org_b", "att_1")
    expect(attachment).toBeNull()
    expect(storage.open).not.toHaveBeenCalled()
  })

  it("unlinks every large object when a message is deleted", async () => {
    const { repo, storage, service } = buildService()
    repo.findMessage.mockResolvedValue(
      messageRow({
        attachments: [
          { id: "a1", name: "a", kind: "file", oid: 7n },
          { id: "a2", name: "b", kind: "file", oid: 8n },
          { id: "a3", name: "c", kind: "file", oid: null },
        ],
      }) as never
    )

    await service.deleteMessage(ctxA, "msg_a")

    expect(repo.deleteMessage).toHaveBeenCalledWith("msg_a")
    expect(storage.unlink).toHaveBeenCalledTimes(2)
    expect(storage.unlink).toHaveBeenCalledWith(7)
    expect(storage.unlink).toHaveBeenCalledWith(8)
  })

  it("refuses to delete a message from another organization", async () => {
    const { repo, storage, service } = buildService()
    repo.findMessage.mockResolvedValue(null)

    await expect(service.deleteMessage(ctxB, "msg_a")).rejects.toMatchObject({
      message: expect.stringContaining("Message"),
    })
    expect(repo.deleteMessage).not.toHaveBeenCalled()
    expect(storage.unlink).not.toHaveBeenCalled()
  })
})
