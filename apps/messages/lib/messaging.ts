import { createMessagingRuntime } from "@workspace/messaging"

import { recordUserAudit } from "@/lib/audit"
import { identity } from "@/lib/identity"
import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

/**
 * The messages app's binding of `@workspace/messaging`: the package owns the
 * conversation rules, this module supplies its own database, the large-object
 * store attachments are served from and the identity directory (presence and
 * DM titles).
 */
const runtime = createMessagingRuntime({
  db: prisma,
  storage: largeObjectStore,
  audit: (ctx, input) => recordUserAudit(ctx, input),
  directory: {
    listPresence(organizationId) {
      return identity.listPresence(organizationId)
    },
    async findName(organizationId, userId) {
      const members = await identity.listMembers(organizationId)
      return members.find((member) => member.id === userId)?.name ?? null
    },
    async touchPresence(userId) {
      await identity.touchPresence(userId)
    },
  },
})

export const messagingService = runtime.service
export const messagingRepository = runtime.repository
export const {
  listAttachmentsForExport,
  snapshotForOrganization: snapshotMessagingForOrganization,
} = runtime.objects
