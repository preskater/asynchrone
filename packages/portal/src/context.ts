import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, UnauthorizedError } from "@workspace/core/errors"
import { can } from "@workspace/organization/roles"

import type { PortalContext } from "./types"

/**
 * Client-member authorization.
 *
 * A portal user is a `Member` row linked to a client company (`clientId`).
 * Every client-facing read and write is scoped by both `organizationId` and
 * `clientId`, so a portal session can never reach another organization, and a
 * missing link never falls back to the internal workspace.
 */

/** The signed-in client, or an unauthorized error. */
export function requirePortalContext(
  ctx: PortalContext | null | undefined
): PortalContext {
  if (!ctx?.clientId || !ctx.organizationId) throw new UnauthorizedError()
  return ctx
}

/** Whether the given context is a portal (client-company linked) context. */
export function isPortalContext(
  ctx: PortalContext | null | undefined
): ctx is PortalContext {
  return Boolean(ctx?.clientId && ctx.organizationId)
}

/** Portal access management requires an admin (portal invitations). */
export function requirePortalManager(ctx: Pick<RequestContext, "roles">): void {
  if (can(ctx, "portal:manage")) return
  throw new ForbiddenError("Your role cannot manage portal access.", {
    code: "role_cannot_manage_members",
  })
}

/** The internal view of portal access is readable by members and up. */
export function requireInternalMember(
  ctx: Pick<RequestContext, "roles">
): void {
  if (can(ctx, "portal:read")) return
  throw new ForbiddenError("Your role cannot view portal access.", {
    code: "role_cannot_manage_members",
  })
}
