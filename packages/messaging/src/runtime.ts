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
 * Copilot calls this once from `apps/copilot/lib/messaging.ts`. When Messages
 * becomes `apps/messages` it calls the same factory with its own pool and
 * database.
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
