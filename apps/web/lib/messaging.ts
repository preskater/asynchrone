import { createMessagingRuntime } from "@workspace/messaging"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

/**
 * Copilot's binding of `@workspace/messaging`: the package owns the
 * conversation rules, this module supplies the identity database and the
 * large-object store attachments are served from.
 */
const runtime = createMessagingRuntime({
  db: prisma,
  storage: largeObjectStore,
})

export const messagingService = runtime.service
export const messagingRepository = runtime.repository
export const {
  listAttachmentsForExport,
  snapshotForOrganization: snapshotMessagingForOrganization,
} = runtime.objects
