import { createMessagingRuntime } from "@workspace/messaging"

import { largeObjectStore } from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

/**
 * The messages app's binding of `@workspace/messaging`: the package owns the
 * conversation rules, this module supplies the database and the large-object
 * store attachments are served from.
 *
 * Copilot keeps its own in-process binding (`apps/copilot/lib/messaging.ts`)
 * for the assistant, MCP and search until #190; both write the same rows.
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
