import type {
  PortalAudit,
  PortalCollaboration,
  PortalFiles,
  PortalInvitations,
  PortalMeetings,
  PortalNotify,
  PortalStorage,
} from "./deps"
import { PortalRepository, type PortalDb } from "./repository"
import { PortalService } from "./service"

export interface PortalRuntimeOptions {
  /** Copilot's identity client (the portal keeps its routes there). */
  db: PortalDb
  /** The large-object store bound to Copilot's pool (`@workspace/storage`). */
  storage: PortalStorage
  /** Copilot's `@workspace/files` service, quota and usage readers. */
  files: PortalFiles
  /** Copilot's `@workspace/projects` thread and task-comment adapters. */
  collaboration: PortalCollaboration
  /** Copilot's `@workspace/meetings` service. */
  meetings: PortalMeetings
  /** Better Auth invitations, bound with the request headers. */
  invitations: PortalInvitations
  /** `recordUserAudit` from Copilot's audit adapter. */
  audit: PortalAudit
  /** Copilot's notification inbox. */
  notify: PortalNotify
}

export interface PortalRuntime {
  repository: PortalRepository
  service: PortalService
}

/**
 * Bind the portal domain to one app's database and services.
 *
 * Copilot calls this once from `apps/copilot/lib/portal/index.ts`. The portal has
 * no app of its own: its routes and APIs stay in Copilot, and every cross-app
 * read goes through the domain packages until #190 replaces them with internal
 * clients.
 */
export function createPortalRuntime(
  options: PortalRuntimeOptions
): PortalRuntime {
  const repository = new PortalRepository(options.db)
  const service = new PortalService({
    repository,
    storage: options.storage,
    files: options.files,
    collaboration: options.collaboration,
    meetings: options.meetings,
    invitations: options.invitations,
    audit: options.audit,
    notify: options.notify,
  })

  return { repository, service }
}
