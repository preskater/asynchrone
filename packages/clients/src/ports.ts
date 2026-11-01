import type { NotifyArgs } from "@workspace/notifications"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/web/lib/*`: audit rows and inbox
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
