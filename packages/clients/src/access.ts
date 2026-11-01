import type { RequestContext } from "@workspace/core/context"
import { roleRank } from "@workspace/organization/roles"

export interface ClientAccess {
  rank: number
  /** Member and above: create, edit, archive and restore records. */
  canEdit: boolean
  /** Admin and above: pipelines, custom field configuration. */
  canManage: boolean
  /** Member and above: CSV import/export. */
  canExport: boolean
}

export function resolveClientAccess(ctx: RequestContext): ClientAccess {
  const rank = roleRank(ctx.role)
  return {
    rank,
    canEdit: rank >= 2,
    canManage: rank >= 3,
    canExport: rank >= 2,
  }
}
