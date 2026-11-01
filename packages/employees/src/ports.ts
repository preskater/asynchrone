/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/web/lib/*`: audit rows are injected so
 * Employees can run inside Copilot today and inside `apps/employees` later
 * without changing the service.
 */

/** One audit row for an employee-domain mutation. */
export interface EmployeeAuditEntry {
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
export type EmployeeAudit = (
  entries: EmployeeAuditEntry[]
) => Promise<{ count: number }>
