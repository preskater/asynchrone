import { headers } from "next/headers"

import {
  recordAudit as recordAuditWithDb,
  recordAuditMany as recordAuditManyWithDb,
  recordUserAudit as recordUserAuditWithMeta,
  recordUserAuditMany as recordUserAuditManyWithMeta,
  recordSystemAudit as recordSystemAuditWithDb,
  userAuditEntry,
  type AuditActor,
  type AuditCreateInput,
  type AuditDb,
  type AuditEntry,
  type RequestMeta,
  type UserAuditInput,
} from "@workspace/audit"
import type { PrismaClient } from "@workspace/db"

import type { RequestContext } from "@workspace/core/context"

import { SYSTEM_ACTOR_ID } from "./actions"
import { EMPTY_REQUEST_META, requestMetaFromHeaders } from "./request-meta"

/**
 * App-specific audit writes: resolve the shared client and the request
 * metadata, then delegate to `@workspace/audit` with an explicit database.
 */
export type { AuditDb, AuditEntry, UserAuditInput }

let sharedDb: AuditDb | null = null

async function resolveDb(db?: AuditDb | null): Promise<AuditDb> {
  if (db) return db
  if (!sharedDb) {
    const { prisma } = await import("@/lib/prisma")
    sharedDb = prisma
  }
  return sharedDb
}

/** JSON-serialisable copy of a snapshot, for the identity backfill. */
export type { AuditCreateInput }

/** Request IP and user agent, or empty values outside a request scope. */
export async function currentRequestMeta(): Promise<RequestMeta> {
  try {
    return requestMetaFromHeaders(await headers())
  } catch {
    return EMPTY_REQUEST_META
  }
}

function actor(
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >
): AuditActor {
  return {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    userName: ctx.userName,
    userEmail: ctx.userEmail,
  }
}

/**
 * The one way to write an audit row. Every mutating server action calls this
 * (see `docs/audit-log.md`), so the settings page, the retention job and the
 * export all read a single, uniform table.
 *
 * Errors propagate: a mutation that cannot be audited should fail rather than
 * change data silently. The only caller that swallows a failure is the Better
 * Auth after-hook, where the change is already committed.
 */
export async function recordAudit(
  entry: AuditEntry,
  db?: AuditDb | null
): Promise<void> {
  await recordAuditWithDb(entry, await resolveDb(db))
}

/** Writes several rows in one statement (bulk file and import operations). */
export async function recordAuditMany(
  entries: AuditEntry[],
  db?: AuditDb | null
): Promise<void> {
  if (entries.length === 0) return
  await recordAuditManyWithDb(entries, await resolveDb(db))
}

/** Records one change made by the acting user of `ctx`. */
export async function recordUserAudit(
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  input: UserAuditInput,
  db?: AuditDb | null
): Promise<void> {
  const meta = await currentRequestMeta()
  await recordUserAuditWithMeta(actor(ctx), input, meta, await resolveDb(db))
}

/** Records several changes made by the acting user of `ctx`. */
export async function recordUserAuditMany(
  ctx: Pick<
    RequestContext,
    "organizationId" | "userId" | "userName" | "userEmail"
  >,
  inputs: UserAuditInput[],
  db?: AuditDb | null
): Promise<void> {
  if (inputs.length === 0) return
  const meta = await currentRequestMeta()
  await recordUserAuditManyWithMeta(
    actor(ctx),
    inputs,
    meta,
    await resolveDb(db)
  )
}

/** Records a change made by a job or a provider webhook. */
export async function recordSystemAudit(
  entry: Omit<AuditEntry, "actorId">,
  db?: AuditDb | null
): Promise<void> {
  await recordSystemAuditWithDb(entry, await resolveDb(db))
}

/**
 * Fills `actorName`/`actorEmail` from the user table for callers that only
 * carry ids (the client and employee repositories build their entries from `ctx.userId`).
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

export { userAuditEntry, SYSTEM_ACTOR_ID }
