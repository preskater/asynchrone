import type { RequestContext } from "@workspace/core/context"
import { roleRank } from "@workspace/organization/roles"

export interface EmployeeAccess {
  rank: number
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
  const rank = roleRank(ctx.role)
  const isAdmin = rank >= 3
  const isValidator = isAdmin || profileIsValidator
  return {
    rank,
    isAdmin,
    isValidator,
    canViewAll: isValidator,
    canTrack: rank >= 2,
  }
}
