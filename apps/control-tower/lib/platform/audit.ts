import { prisma, type Prisma } from "@workspace/db-control-tower"

import type { PlatformContext } from "./guard"

export interface PlatformAuditInput {
  action: string
  targetType: string
  targetId: string
  organizationId?: string | null
  before?: unknown
  after?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

/**
 * Appends one row to the platform audit trail.
 *
 * Never throws into the caller: an audit failure must not hide the result of
 * an operation, but it is logged loudly.
 */
export async function recordPlatformEvent(
  ctx: PlatformContext,
  input: PlatformAuditInput
): Promise<void> {
  try {
    await prisma.platformAuditEvent.create({
      data: {
        actorId: ctx.userId,
        actorEmail: ctx.userEmail,
        actorRole: ctx.role,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        organizationId: input.organizationId ?? null,
        before: jsonValue(input.before),
        after: jsonValue(input.after),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    console.error("[control-tower] failed to write platform audit event", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      error,
    })
  }
}
