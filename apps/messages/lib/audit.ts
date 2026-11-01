import { headers } from "next/headers"

import {
  recordUserAudit as recordUserAuditWithMeta,
  recordUserAuditMany as recordUserAuditManyWithMeta,
  requestMetaFromHeaders,
  type AuditDb,
  type UserAuditInput,
} from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"

import { prisma } from "@/lib/prisma"

/**
 * Audit writes for the messages app.
 *
 * Rows land in the shared `auditLog` table (per-app model), which Copilot
 * aggregates through `/internal/v1/audit`. Errors propagate: a mutation that
 * cannot be audited must fail.
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

/**
 * Batch variant the files upload service needs (one row per changed entity,
 * one request-metadata lookup).
 */
export async function recordUserAuditMany(
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  inputs: UserAuditInput[],
  db: AuditDb = prisma
): Promise<void> {
  if (inputs.length === 0) return
  const meta = await requestMetaFromHeaders(await headers())
  await recordUserAuditManyWithMeta(
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userName: ctx.userName,
      userEmail: ctx.userEmail,
    },
    inputs,
    meta,
    db
  )
}

export type { UserAuditInput }
