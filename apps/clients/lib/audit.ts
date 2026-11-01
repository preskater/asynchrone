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
import type { PrismaClient } from "@workspace/db"

import { prisma } from "@/lib/prisma"

/**
 * Audit writes for the clients app.
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

/** Bulk writes; the clients repository hands whole mutations at once. */
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
    actorId: string
    actorName?: string | null
    actorEmail?: string | null
  },
>(entries: T[], db: Pick<PrismaClient, "user">): Promise<T[]> {
  const missing = entries.filter(
    (entry) => !entry.actorName && entry.actorId !== SYSTEM_ACTOR_ID
  )
  if (missing.length === 0) return entries
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(missing.map((entry) => entry.actorId))] } },
    select: { id: true, name: true, email: true },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
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
