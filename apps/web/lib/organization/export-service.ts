import { once } from "node:events"
import { PassThrough } from "node:stream"

import { Zip, ZipDeflate, ZipPassThrough } from "fflate"

import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import type { RequestContext } from "@workspace/core/context"
import { requirePermission } from "@/lib/core/auth-context"
import { ConflictError } from "@workspace/core/errors"
import { sendDataExportReadyEmail } from "@/lib/email"
import {
  openLargeObjectStream,
  unlinkLargeObject,
  uploadLargeObject,
} from "@/lib/large-object"
import { prisma } from "@/lib/prisma"

/** How long a finished archive can be downloaded. */
import { DATA_EXPORT_TTL_DAYS } from "@workspace/organization/lifecycle"

export const EXPORT_TTL_DAYS = DATA_EXPORT_TTL_DAYS

const DAY = 24 * 60 * 60 * 1000
const STALE_AFTER_MS = 60 * 60 * 1000

/**
 * One JSON file per table. `from` is the SQL after `SELECT t.* FROM`, scoped
 * to `$1` (the organization id) and aliasing the exported table as `t`.
 * Platform-internal tables (audit events, handoffs, trial claims, rate
 * limits, billing webhook logs) and unfinished uploads are left out.
 */
const DIRECT = [
  "team",
  "member",
  "invitation",
  "project",
  "label",
  "task",
  "task_identifier_counter",
  "taskTemplate",
  "projectMessage",
  "repositoryConnection",
  "calendar",
  "calendarEvent",
  "meetingSettings",
  "meetingRequest",
  "fileNode",
  "chatTeam",
  "conversation",
  "employeeProfile",
  "employeeSettings",
  "attendanceEntry",
  "leaveRequest",
  "leaveBalance",
  "leaveAdjustment",
  "salaryProfile",
  "client",
  "contact",
  "pipeline",
  "deal",
  "clientActivity",
  "clientFieldDefinition",
  "clientDocument",
  "notification",
  "portalInvite",
  "internalActivity",
  "auditLog",
  "subscription",
  "invoice",
  "ai_usage_event",
  "dataExport",
].map((table) => ({
  table,
  from: `"${table}" t WHERE t."organizationId" = $1`,
}))

const child = (table: string, fk: string, parent: string) => ({
  table,
  from: `"${table}" t JOIN "${parent}" p ON p.id = t."${fk}" WHERE p."organizationId" = $1`,
})

const TABLES = [
  ...DIRECT,
  child("teamMember", "teamId", "team"),
  child("projectMember", "projectId", "project"),
  child("projectLabel", "projectId", "project"),
  child("projectActivity", "projectId", "project"),
  child("taskLabel", "taskId", "task"),
  child("subtask", "taskId", "task"),
  child("taskComment", "taskId", "task"),
  child("calendarMember", "calendarId", "calendar"),
  child("eventAttendee", "eventId", "calendarEvent"),
  child("meetingSlot", "requestId", "meetingRequest"),
  child("fileShare", "fileId", "fileNode"),
  child("fileVersion", "fileId", "fileNode"),
  child("fileActivity", "fileId", "fileNode"),
  child("conversationMember", "conversationId", "conversation"),
  child("message", "conversationId", "conversation"),
  child("contactCompany", "contactId", "contact"),
  child("pipelineStage", "pipelineId", "pipeline"),
  child("dealContact", "dealId", "deal"),
  {
    table: "messageReaction",
    from: `"messageReaction" t JOIN "message" m ON m.id = t."messageId" JOIN "conversation" p ON p.id = m."conversationId" WHERE p."organizationId" = $1`,
  },
  {
    table: "messageAttachment",
    from: `"messageAttachment" t JOIN "message" m ON m.id = t."messageId" JOIN "conversation" p ON p.id = m."conversationId" WHERE p."organizationId" = $1`,
  },
]

/** Columns that are credentials, never part of an export. */
const SECRET_COLUMNS: Record<string, string[]> = {
  repositoryConnection: ["webhookSecret"],
}

export async function listExports(organizationId: string) {
  return prisma.dataExport.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      sizeBytes: true,
      createdAt: true,
      completedAt: true,
      expiresAt: true,
    },
  })
}

/** Queues an export of the active organization. Owners only. */
export async function requestExport(ctx: RequestContext) {
  requirePermission(ctx, ["owner"])

  const inFlight = await prisma.dataExport.findFirst({
    where: {
      organizationId: ctx.organizationId,
      status: { in: ["pending", "processing"] },
    },
    select: { id: true },
  })
  if (inFlight) {
    throw new ConflictError("An export is already being prepared.", {
      code: "export_in_progress",
    })
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.dataExport.create({
      data: { organizationId: ctx.organizationId, requestedById: ctx.userId },
      select: { id: true },
    })
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationExportRequested,
        entityType: "dataExport",
        entityId: created.id,
      },
      tx
    )
    return created
  })
}

function toJson(rows: Record<string, unknown>[]) {
  return JSON.stringify(
    rows,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  )
}

/** Keeps archive paths readable and free of separators or control bytes. */
function safeName(name: string) {
  return name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "file"
}

/**
 * Writes the archive straight into a new large object, so neither the JSON
 * nor the files are ever held in memory as a whole ZIP.
 */
async function writeArchive(organizationId: string) {
  const out = new PassThrough()
  const uploading = uploadLargeObject(out)
  const zip = new Zip((error, chunk, final) => {
    if (error) return out.destroy(error)
    out.write(chunk)
    if (final) out.end()
  })
  const drain = async () => {
    if (out.writableNeedDrain) await once(out, "drain")
  }
  const addText = async (path: string, text: string) => {
    const entry = new ZipDeflate(path, { level: 6 })
    zip.add(entry)
    entry.push(new TextEncoder().encode(text), true)
    await drain()
  }
  const addLargeObject = async (path: string, oid: bigint) => {
    const entry = new ZipPassThrough(path)
    zip.add(entry)
    const { stream } = await openLargeObjectStream(Number(oid))
    for await (const chunk of stream) {
      entry.push(chunk as Uint8Array)
      await drain()
    }
    entry.push(new Uint8Array(0), true)
  }

  try {
    const counts: Record<string, number> = {}
    for (const { table, from } of TABLES) {
      // ponytail: one query per table loads it whole; page it if an export
      // ever runs out of memory on a very large organization.
      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `SELECT t.* FROM ${from}`,
        organizationId
      )
      for (const column of SECRET_COLUMNS[table] ?? []) {
        for (const row of rows) delete row[column]
      }
      counts[table] = rows.length
      await addText(`data/${table}.json`, toJson(rows))
    }

    const files = await prisma.fileNode.findMany({
      where: { organizationId, oid: { not: null } },
      select: { id: true, name: true, oid: true },
    })
    const versions = await prisma.fileVersion.findMany({
      where: { file: { organizationId }, oid: { not: null } },
      select: {
        id: true,
        fileId: true,
        oid: true,
        file: { select: { name: true } },
      },
    })
    const attachments = await prisma.messageAttachment.findMany({
      where: {
        message: { conversation: { organizationId } },
        oid: { not: null },
      },
      select: { id: true, name: true, oid: true },
    })

    // Versions often share the current bytes; each large object goes in once.
    const seen = new Set<bigint>()
    let fileCount = 0
    for (const file of files) {
      seen.add(file.oid!)
      await addLargeObject(`files/${file.id}-${safeName(file.name)}`, file.oid!)
      fileCount++
    }
    for (const version of versions) {
      if (seen.has(version.oid!)) continue
      seen.add(version.oid!)
      await addLargeObject(
        `files/versions/${version.fileId}/${version.id}-${safeName(version.file.name)}`,
        version.oid!
      )
      fileCount++
    }
    for (const attachment of attachments) {
      await addLargeObject(
        `attachments/${attachment.id}-${safeName(attachment.name)}`,
        attachment.oid!
      )
      fileCount++
    }

    await addText(
      "manifest.json",
      JSON.stringify(
        {
          organizationId,
          exportedAt: new Date().toISOString(),
          tables: counts,
          files: fileCount,
        },
        null,
        2
      )
    )
    zip.end()
  } catch (error) {
    out.destroy(error as Error)
    await uploading.catch(() => {})
    throw error
  }

  return uploading
}

/** Builds one pending export. Returns false when another run claimed it. */
export async function buildExport(exportId: string, now = new Date()) {
  const { count } = await prisma.dataExport.updateMany({
    where: { id: exportId, status: "pending" },
    data: { status: "processing", startedAt: now },
  })
  if (count === 0) return false

  const job = await prisma.dataExport.findUniqueOrThrow({
    where: { id: exportId },
    select: {
      organizationId: true,
      requestedById: true,
      organization: { select: { name: true, slug: true } },
    },
  })

  try {
    const { oid, size } = await writeArchive(job.organizationId)
    await prisma.dataExport.update({
      where: { id: exportId },
      data: {
        status: "ready",
        oid,
        sizeBytes: size,
        completedAt: new Date(),
        expiresAt: new Date(Date.now() + EXPORT_TTL_DAYS * DAY),
      },
    })
  } catch (error) {
    console.error(`[data-export] ${exportId} failed`, error)
    await prisma.dataExport.update({
      where: { id: exportId },
      data: { status: "failed", error: String(error).slice(0, 500) },
    })
    return true
  }

  const requester = await prisma.user.findUnique({
    where: { id: job.requestedById },
    select: { email: true },
  })
  if (requester) {
    sendDataExportReadyEmail({
      to: requester.email,
      organizationName: job.organization.name,
      url: new URL(
        `/${job.organization.slug}/settings`,
        process.env.BETTER_AUTH_URL
      ).toString(),
      days: EXPORT_TTL_DAYS,
    })
  }
  return true
}

/**
 * Cron job: builds pending exports, then unlinks the archives whose download
 * window has passed. Both steps are claimed with conditional updates, so an
 * overlapping or repeated run is harmless.
 */
export async function processExports(now = new Date()) {
  // A build interrupted by a restart never finishes; let the owner retry.
  await prisma.dataExport.updateMany({
    where: {
      status: "processing",
      startedAt: { lte: new Date(now.getTime() - STALE_AFTER_MS) },
    },
    data: { status: "failed", error: "Interrupted before completion." },
  })

  const pending = await prisma.dataExport.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  let built = 0
  for (const { id } of pending) {
    if (await buildExport(id, now)) built++
  }

  const due = await prisma.dataExport.findMany({
    where: { status: "ready", expiresAt: { lte: now } },
    select: { id: true, oid: true },
  })
  let expired = 0
  for (const { id, oid } of due) {
    const { count } = await prisma.dataExport.updateMany({
      where: { id, status: "ready" },
      data: { status: "expired", oid: null },
    })
    if (count === 0) continue
    if (oid !== null) await unlinkLargeObject(Number(oid))
    expired++
  }

  return { built, expired }
}
