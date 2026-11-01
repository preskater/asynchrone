import { headers } from "next/headers"

import {
  recordUserAudit as recordUserAuditWithMeta,
  requestMetaFromHeaders,
  type AuditDb,
  type UserAuditInput,
} from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"

import { prisma } from "@/lib/prisma"

/**
 * Audit writes for the projects app.
 *
 * Rows land in this app's own `auditLog` table (shared model, per-app database)
 * and Copilot aggregates them through `/internal/v1/audit`. Errors propagate:
 * a mutation that cannot be audited must fail.
 */
export async function recordUserAudit(
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  input: UserAuditInput,
  db: AuditDb = prisma
): Promise<void> {
  const meta = await requestMetaFromHeaders(await headers())
  await recordUserAuditWithMeta(
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userName: ctx.userName,
      userEmail: ctx.userEmail,
    },
    input,
    meta,
    db
  )
}

export type { UserAuditInput }
