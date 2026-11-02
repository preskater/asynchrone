import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("messages", {
    chatTeam: () => prisma.chatTeam.findMany({ where }),
    conversation: () => prisma.conversation.findMany({ where }),
    conversationMember: () =>
      prisma.conversationMember.findMany({
        where: { conversation: where },
      }),
    message: () =>
      prisma.message.findMany({ where: { conversation: where } }),
    messageReaction: () =>
      prisma.messageReaction.findMany({
        where: { message: { conversation: where } },
      }),
    messageAttachment: () =>
      prisma.messageAttachment.findMany({
        where: { message: { conversation: where } },
      }),
    uploadSession: () => prisma.uploadSession.findMany({ where }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
