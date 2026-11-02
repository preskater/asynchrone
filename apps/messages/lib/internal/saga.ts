import type { DeletionResult } from "@workspace/contracts"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

const APP = "messages"

async function unlink(oids: (bigint | null)[]) {
  for (const oid of new Set(oids.filter((value): value is bigint => value !== null))) {
    await largeObjectStore.unlink(Number(oid)).catch((error: unknown) => {
      console.error(`[messages] unlink ${oid} failed`, error)
    })
  }
}

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const [attachments, sessions] = await Promise.all([
    prisma.messageAttachment.findMany({
      where: { message: { conversation: where } },
      select: { oid: true },
    }),
    prisma.uploadSession.findMany({ where, select: { oid: true } }),
  ])
  const deleted = await prisma.$transaction(async (tx) => {
    const reactions = await tx.messageReaction.deleteMany({
      where: { message: { conversation: where } },
    })
    const attachmentRows = await tx.messageAttachment.deleteMany({
      where: { message: { conversation: where } },
    })
    const messages = await tx.message.deleteMany({
      where: { conversation: where },
    })
    const members = await tx.conversationMember.deleteMany({
      where: { conversation: where },
    })
    const conversations = await tx.conversation.deleteMany({ where })
    const teams = await tx.chatTeam.deleteMany({ where })
    const uploads = await tx.uploadSession.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      messageReaction: reactions.count,
      messageAttachment: attachmentRows.count,
      message: messages.count,
      conversationMember: members.count,
      conversation: conversations.count,
      chatTeam: teams.count,
      uploadSession: uploads.count,
      auditLog: auditLog.count,
    }
  })
  await unlink([
    ...attachments.map((row) => row.oid),
    ...sessions.map((row) => row.oid),
  ])
  return { app: APP, organizationId, deleted, completedAt: new Date() }
}

export async function deleteUser(
  userId: string,
  organizationId = ""
): Promise<DeletionResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    const members = await tx.conversationMember.deleteMany({
      where: { userId },
    })
    const reactions = await tx.messageReaction.deleteMany({ where: { userId } })
    const messages = await tx.message.updateMany({
      where: { authorId: userId },
      data: { authorId: "deleted" },
    })
    const uploads = await tx.uploadSession.deleteMany({ where: { userId } })
    return {
      conversationMember: members.count,
      messageReaction: reactions.count,
      message: messages.count,
      uploadSession: uploads.count,
    }
  })
  return {
    app: APP,
    organizationId,
    userId,
    deleted,
    completedAt: new Date(),
  }
}
