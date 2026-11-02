import type { RequestContext } from "@workspace/core/context"

/**
 * Ports the owning app binds in its adapter.
 *
 * The package never imports `apps/copilot/lib/*`: audit rows are injected so
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

/** One internal member of the organization. */
export interface EmployeeDirectoryMember {
  userId: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
  clientId?: string | null
}

/** The identity directory, bound to Copilot's internal API. */
export interface EmployeeDirectory {
  list(organizationId: string): Promise<EmployeeDirectoryMember[]>
}

/** The project fields the employees app reads and updates. */
export interface EmployeeProjectRow {
  id: string
  name: string
  status: string
  clientId: string | null
  clientName?: string | null
  isBillable: boolean
  plannedHours?: number | null
  startDate?: Date | null
  endDate?: Date | null
}

export interface EmployeeProjectUpdate {
  clientId?: string | null
  plannedHours?: number | null
  isBillable?: boolean
  startDate?: Date | null
  endDate?: Date | null
}

/** The projects domain, through its internal API. */
export interface EmployeeProjects {
  list(ctx: RequestContext): Promise<EmployeeProjectRow[]>
  find(ctx: RequestContext, id: string): Promise<EmployeeProjectRow | null>
  update(
    ctx: RequestContext,
    id: string,
    input: EmployeeProjectUpdate
  ): Promise<EmployeeProjectRow>
}

/** The client records the payroll settings edit, owned by the clients app. */
export interface EmployeeClientRow {
  id: string
  name: string
  contactEmail: string | null
  isActive: boolean
}

export interface EmployeeClients {
  list(ctx: RequestContext): Promise<EmployeeClientRow[]>
  find(ctx: RequestContext, id: string): Promise<EmployeeClientRow | null>
  create(
    ctx: RequestContext,
    input: { name: string; contactEmail?: string | null; isActive: boolean }
  ): Promise<EmployeeClientRow>
  update(
    ctx: RequestContext,
    id: string,
    input: { name: string; contactEmail?: string | null; isActive: boolean }
  ): Promise<EmployeeClientRow>
}

export interface EmployeeRepositoryPorts {
  directory: EmployeeDirectory
  projects: EmployeeProjects
  clients: EmployeeClients
}
