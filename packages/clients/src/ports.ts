import type { RequestContext } from "@workspace/core/context"
import type { NotifyArgs } from "@workspace/notifications"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/copilot/lib/*`: audit rows and inbox
 * notifications are injected so Clients can run inside Copilot today and
 * inside `apps/clients` later without changing the service.
 */

/** One audit row for a client-domain mutation. */
export interface ClientAuditEntry {
  organizationId: string
  actorId: string
  actorName?: string | null
  actorEmail?: string | null
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}

/**
 * Writes the audit rows of one mutation. Copilot binds
 * `recordAuditMany(withActorIdentity(entries))` so the actor snapshot and
 * request metadata stay with the app.
 */
export type ClientAudit = (
  entries: ClientAuditEntry[]
) => Promise<{ count: number }>

/** Sends one inbox notification (the identity app owns the inbox). */
export type ClientNotify = (args: NotifyArgs) => Promise<void>

export interface ClientServicePorts {
  notify: ClientNotify
}

/** One internal member of the organization, used for owner names and access. */
export interface ClientDirectoryMember {
  userId: string
  name: string
  email: string
  role: string
  clientId?: string | null
}

/** The identity directory, bound to Copilot's internal API in the clients app. */
export interface ClientDirectory {
  list(organizationId: string): Promise<ClientDirectoryMember[]>
}

/** One project, as the clients app needs it for links and counters. */
export interface ClientProjectRow {
  id: string
  name: string
  status: string
  clientId: string | null
  clientName?: string | null
}

/** The projects domain, read and written through its internal API. */
export interface ClientProjects {
  countsByClient(
    ctx: RequestContext
  ): Promise<{ clientId: string | null; count: number }[]>
  countForClient(ctx: RequestContext, clientId: string): Promise<number>
  listOptions(ctx: RequestContext): Promise<ClientProjectRow[]>
  listLinkOptions(ctx: RequestContext): Promise<ClientProjectRow[]>
  listForClient(ctx: RequestContext, clientId: string): Promise<ClientProjectRow[]>
  find(ctx: RequestContext, id: string): Promise<ClientProjectRow | null>
  setClient(
    ctx: RequestContext,
    id: string,
    clientId: string | null
  ): Promise<ClientProjectRow>
  /** Creates a task; retries with the same key return the first task. */
  createTask(
    ctx: RequestContext,
    input: ClientTaskInput,
    idempotencyKey: string
  ): Promise<ClientTaskRow>
}

/** A task the clients app asks the projects app to create. */
export interface ClientTaskInput {
  projectId: string
  title: string
  description: string
  priority: "low" | "medium" | "high" | "urgent"
  assigneeId: string | null
}

export interface ClientTaskRow {
  id: string
  identifier: string
  projectId: string
}

/** One file, as document links need it. */
export interface ClientFileRow {
  id: string
  name: string
  kind: string
  mimeType: string | null
  sizeBytes: number | null
  trashed: boolean
  modifiedAt?: string
}

/** The files domain, read through its internal API. */
export interface ClientFiles {
  find(ctx: RequestContext, id: string): Promise<ClientFileRow | null>
  byIds(ctx: RequestContext, ids: string[]): Promise<ClientFileRow[]>
  listOptions(ctx: RequestContext): Promise<ClientFileRow[]>
}

/** Cross-domain ports the repository binds. */
export interface ClientRepositoryPorts {
  directory: ClientDirectory
  projects: ClientProjects
  files: ClientFiles
}
