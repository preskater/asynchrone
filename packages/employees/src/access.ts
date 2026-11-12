import type { RequestContext } from "@workspace/core/context"
import { can } from "@workspace/organization/roles"

export interface EmployeeAccess {
  /** Org admin/owner: full management. */
  isAdmin: boolean
  /** Admin or explicitly designated validator: approvals + team views. */
  isValidator: boolean
  /** May see and act on the whole team's data (capacity, tracking, leave). */
  canViewAll: boolean
  /** Member or above: may edit their own attendance and request leave. */
  canTrack: boolean
}

export function resolveEmployeeAccess(
  ctx: RequestContext,
  profileIsValidator = false
): EmployeeAccess {
  const isAdmin = can(ctx, "hr:manage")
  const isValidator = isAdmin || profileIsValidator
  return {
    isAdmin,
    isValidator,
    canViewAll: isValidator,
    canTrack: can(ctx, "hr:track"),
  }
}
