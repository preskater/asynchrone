import type { MessagingStorage } from "./deps"
import { createMessagingObjects, type MessagingObjects } from "./objects"
import { MessagingRepository, type MessagingDb } from "./repository"
import { MessagingService } from "./service"

export interface MessagingRuntimeOptions {
  /** The messaging app's own database client. */
  db: MessagingDb
  /** The large-object store bound to the app's own pool. */
  storage: MessagingStorage
}

export interface MessagingRuntime {
  repository: MessagingRepository
  service: MessagingService
  objects: MessagingObjects
}

/**
 * Bind the messaging domain to one app's database and large-object store.
 *
 * `apps/messages` calls this once from its `lib/messaging.ts`; Copilot keeps
 * its own binding (`apps/copilot/lib/messaging.ts`) for the assistant, MCP and
 * search until #190.
 */
export function createMessagingRuntime(
  options: MessagingRuntimeOptions
): MessagingRuntime {
  const repository = new MessagingRepository(options.db)
  const service = new MessagingService(repository, {
    storage: options.storage,
  })
  const objects = createMessagingObjects(options.db, options.storage)

  return { repository, service, objects }
}
