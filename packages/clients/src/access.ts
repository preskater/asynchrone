import type { RequestContext } from "@workspace/core/context"
import { can } from "@workspace/organization/roles"

export interface ClientAccess {
  /** Member and above: create, edit, archive and restore records. */
  canEdit: boolean
  /** Admin and above: pipelines, custom field configuration. */
  canManage: boolean
  /** Member and above: CSV import/export. */
  canExport: boolean
}

export function resolveClientAccess(ctx: RequestContext): ClientAccess {
  return {
    canEdit: can(ctx, "crm:write"),
    canManage: can(ctx, "crm:manage"),
    canExport: can(ctx, "crm:write"),
  }
}
