import type { MessagingDirectory, MessagingStorage } from "./deps"
import type { MessagingAudit } from "./service"
import { createMessagingObjects, type MessagingObjects } from "./objects"
import { MessagingRepository, type MessagingDb } from "./repository"
import { MessagingService } from "./service"

export interface MessagingRuntimeOptions {
  /** The messaging app's own database client. */
  db: MessagingDb
  /** The large-object store bound to the app's own pool. */
  storage: MessagingStorage
  /** The identity reads (presence and the DM title). */
  directory: MessagingDirectory
  /** The app's audit writer (`recordUserAudit`). */
  audit?: MessagingAudit
  /** Publishes a real-time hint after a shared change (#98). */
  changed?: (organizationId: string) => Promise<void>
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
  const repository = new MessagingRepository(options.db, options.directory)
  const service = new MessagingService(repository, {
    storage: options.storage,
    audit: options.audit,
    changed: options.changed,
  })
  const objects = createMessagingObjects(options.db, options.storage)

  return { repository, service, objects }
}
