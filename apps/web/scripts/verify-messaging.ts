import "dotenv/config"

import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import type { RequestContext } from "@workspace/core/context"
import { MessagingRepository, MessagingService } from "@workspace/messaging"

import { largeObjectStore } from "../lib/large-object"
import { snapshotMessagingForOrganization } from "../lib/messaging"
import { prisma } from "../lib/prisma"

/**
 * Manual check for the messaging domain against a live database: attachment
 * upload/download, conversation membership, unread state and cross-organization
 * authorization. Creates throwaway rows and deletes them before exiting.
 *
 *   npm run verify:messaging --workspace=web
 */

let failures = 0

function check(label: string, ok: boolean) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${label}`)
}

function ctxFor(
  organizationId: string,
  userId: string,
  role: RequestContext["role"] = "owner"
): RequestContext {
  return {
    organizationId,
    userId,
    userName: userId,
    userEmail: `${userId}@verify.local`,
    role,
  }
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  await pipeline(stream, async function* (source) {
    for await (const chunk of source) {
      chunks.push(Buffer.from(chunk))
    }
  })
  return Buffer.concat(chunks)
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const orgA = `org_msg_verify_a_${suffix}`
  const orgB = `org_msg_verify_b_${suffix}`
  const alice = `user_msg_verify_alice_${suffix}`
  const bob = `user_msg_verify_bob_${suffix}`
  const mallory = `user_msg_verify_mallory_${suffix}`

  const ctxA = ctxFor(orgA, alice)
  const ctxB = ctxFor(orgB, mallory)

  const repository = new MessagingRepository(prisma)
  const service = new MessagingService(repository, {
    storage: largeObjectStore,
  })

  const created: { conversationIds: string[]; oids: number[] } = {
    conversationIds: [],
    oids: [],
  }

  try {
    await prisma.organization.createMany({
      data: [
        {
          id: orgA,
          name: `Verify A ${suffix}`,
          slug: orgA,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: `Verify B ${suffix}`,
          slug: orgB,
          createdAt: new Date(),
        },
      ],
    })

    const team = await prisma.chatTeam.create({
      data: { organizationId: orgA, name: `Verify ${suffix}` },
    })
    const channel = await service.createChannel(ctxA, {
      teamId: team.id,
      name: "verify",
      topic: "attachment check",
    })
    created.conversationIds.push(channel.id)
    check(
      "a new channel carries its creator as the only member",
      channel.memberIds.length === 1 && channel.memberIds[0] === alice
    )

    // Bob joins the conversation as a member of the same organization.
    await prisma.conversationMember.create({
      data: { conversationId: channel.id, userId: bob },
    })

    // Upload bytes the way the composer does: a files upload session writes a
    // large object, then the message stores its metadata.
    const bytes = Buffer.from(`attachment-${suffix}`.repeat(2048))
    const uploaded = await largeObjectStore.upload(Readable.from(bytes))
    created.oids.push(uploaded.oid)

    const sent = await service.sendMessage(ctxA, {
      conversationId: channel.id,
      body: "see attached",
      attachments: [
        {
          name: "verify.txt",
          kind: "file",
          oid: uploaded.oid,
          mimeType: "text/plain",
          sha256: uploaded.sha256,
          sizeBytes: uploaded.size,
        },
      ],
    })
    check(
      "a message with an attachment stores metadata and marks the bytes present",
      sent.attachments.length === 1 && sent.attachments[0]?.hasStorage === true
    )

    // Membership is preserved and unread state starts from a real database row.
    await prisma.conversation.update({
      where: { id: channel.id },
      data: { unreadCount: 2 },
    })
    const listed = await service.listConversations(ctxA)
    const listedChannel = listed.find((entry) => entry.id === channel.id)
    check(
      "conversation membership round-trips",
      listedChannel?.memberIds.sort().join(",") ===
        [alice, bob].sort().join(",")
    )
    check("unread count round-trips", listedChannel?.unreadCount === 2)

    const read = await service.markRead(ctxA, channel.id)
    check("markRead resets unread state", read?.unreadCount === 0)

    // Download path: the caller's organization only.
    const attachmentId = sent.attachments[0]!.id
    const attachment = await service.openAttachment(ctxA, attachmentId)
    if (!attachment) {
      check("attachment downloads inside its organization", false)
    } else {
      const downloaded = await readAll(attachment.stream)
      check(
        "attachment downloads inside its organization",
        downloaded.equals(bytes) &&
          attachment.size === bytes.length &&
          attachment.mimeType === "text/plain"
      )
    }
    const crossOrg = await service.openAttachment(ctxB, attachmentId)
    check("attachment is hidden from another organization", crossOrg === null)

    // Cross-org message and conversation access.
    const crossOrgMessages = await service
      .listMessages(ctxB, channel.id)
      .then(() => false)
      .catch(() => true)
    check("another organization cannot read the conversation", crossOrgMessages)
    const crossOrgSend = await service
      .sendMessage(ctxB, { conversationId: channel.id, body: "hi" })
      .then(() => false)
      .catch(() => true)
    check("another organization cannot send into it", crossOrgSend)

    // The export/delete snapshot lists the attachment bytes.
    const snapshot = await snapshotMessagingForOrganization(orgA)
    check(
      "the organization snapshot lists the attachment bytes",
      snapshot.oids.includes(uploaded.oid)
    )

    // Deleting the message unlinks its large object.
    await service.deleteMessage(ctxA, sent.id)
    created.oids = created.oids.filter((oid) => oid !== uploaded.oid)
    const remaining = await prisma.message.count({ where: { id: sent.id } })
    check("deleting a message removes the row", remaining === 0)
    const orphans = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM pg_largeobject_metadata
      WHERE oid = ${uploaded.oid}
    `
    check(
      "deleting a message unlinks the attachment bytes",
      Number(orphans[0]?.count ?? 0) === 0
    )
  } finally {
    // Cleanup: conversations cascade to messages, reactions and attachments.
    if (created.conversationIds.length > 0) {
      await prisma.conversation.deleteMany({
        where: { id: { in: created.conversationIds } },
      })
    }
    await prisma.chatTeam.deleteMany({ where: { organizationId: orgA } })
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA, orgB] } },
    })
    for (const oid of created.oids) {
      await largeObjectStore.unlink(oid).catch(() => undefined)
    }
    await prisma.$disconnect()
  }

  if (failures > 0) {
    throw new Error(`${failures} messaging verification check(s) failed`)
  }
  console.log("\nAll messaging verification checks passed.")
}

main().catch((error) => {
  console.error("\nVerification failed:", error)
  process.exitCode = 1
})
