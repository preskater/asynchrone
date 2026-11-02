import { headers } from "next/headers"

import {
  SYSTEM_ACTOR_ID,
  recordAuditMany as recordAuditManyWithDb,
  recordUserAudit as recordUserAuditWithMeta,
  requestMetaFromHeaders,
  type AuditDb,
  type AuditEntry,
  type UserAuditInput,
} from "@workspace/audit"

import { memberDirectory } from "@/lib/identity"
import { prisma } from "@/lib/prisma"

/**
 * Audit writes for the employees app.
 *
 * Rows land in this app's own `auditLog` table (shared model, per-app database)
 * and Copilot aggregates them through `/internal/v1/audit`. Errors propagate:
 * a mutation that cannot be audited must fail.
 */
export async function recordUserAudit(
  actor: {
    organizationId: string
    userId: string
    userName: string | null
    userEmail: string | null
  },
  input: UserAuditInput,
  db: AuditDb = prisma
): Promise<void> {
  const meta = await requestMetaFromHeaders(await headers())
  await recordUserAuditWithMeta(actor, input, meta, db)
}

/** Bulk writes; the employees repository hands whole mutations at once. */
export async function recordAuditMany(
  entries: AuditEntry[],
  db: AuditDb = prisma
): Promise<void> {
  await recordAuditManyWithDb(entries, db)
}

/**
 * Fills `actorName`/`actorEmail` from the user table for callers that only
 * carry ids (the domain repositories build their entries from `ctx.userId`).
 * Snapshotting keeps the row readable once the account is gone.
 */
export async function withActorIdentity<
  T extends {
    organizationId: string
    actorId: string
    actorName?: string | null
    actorEmail?: string | null
  },
>(entries: T[]): Promise<T[]> {
  const missing = entries.filter(
    (entry) => !entry.actorName && entry.actorId !== SYSTEM_ACTOR_ID
  )
  if (missing.length === 0) return entries
  const organizationId = entries[0]?.organizationId
  if (!organizationId) return entries
  const members = await memberDirectory.list(organizationId)
  const byId = new Map(
    members.map((member) => [
      member.userId,
      { name: member.name, email: member.email },
    ])
  )
  return entries.map((entry) => {
    const user = byId.get(entry.actorId)
    if (!user) return entry
    return {
      ...entry,
      actorName: entry.actorName ?? user.name,
      actorEmail: entry.actorEmail ?? user.email,
    }
  })
}

export type { AuditDb, AuditEntry, UserAuditInput }
