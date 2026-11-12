import type { MemberRole } from "@workspace/contracts"

export interface RequestContext {
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  /** The member's cumulative roles; authorize with `can(ctx, capability)`. */
  roles: MemberRole[]
}

export type RequestContextInput = Partial<RequestContext> & {
  organizationId?: string | null
  userId?: string | null
}

export function isSystemActor(ctx: RequestContext) {
  return ctx.userId === "system"
}
