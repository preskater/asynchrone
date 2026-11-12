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
import { sagaRemotes, sagaServices } from "@/lib/sagas/remotes"

/** How long a finished archive can be downloaded. */
import { DATA_EXPORT_TTL_DAYS } from "@workspace/organization/lifecycle"

export const EXPORT_TTL_DAYS = DATA_EXPORT_TTL_DAYS

const DAY = 24 * 60 * 60 * 1000
const STALE_AFTER_MS = 60 * 60 * 1000

/**
 * Identity tables included in an export. Passwords, OAuth grants, sessions,
 * 2FA secrets, rate limits and platform handoffs are credentials and never
 * leave the database.
 */
const TABLES: Record<string, (organizationId: string) => Promise<unknown[]>> = {
  organization: (organizationId) =>
    prisma.organization.findMany({ where: { id: organizationId } }),
  team: (organizationId) =>
    prisma.team.findMany({ where: { organizationId } }),
  teamMember: (organizationId) =>
    prisma.teamMember.findMany({ where: { team: { organizationId } } }),
  member: (organizationId) =>
    prisma.member.findMany({ where: { organizationId } }),
  invitation: (organizationId) =>
    prisma.invitation.findMany({ where: { organizationId } }),
  notification: (organizationId) =>
    prisma.notification.findMany({ where: { organizationId } }),
  portalInvite: (organizationId) =>
    prisma.portalInvite.findMany({ where: { organizationId } }),
  subscription: (organizationId) =>
    prisma.subscription.findMany({ where: { organizationId } }),
  invoice: (organizationId) =>
    prisma.invoice.findMany({ where: { organizationId } }),
  aiUsageEvent: (organizationId) =>
    prisma.aiUsageEvent.findMany({ where: { organizationId } }),
  assistantConversation: (organizationId) =>
    prisma.assistantConversation.findMany({ where: { organizationId } }),
  assistantMessage: (organizationId) =>
    prisma.assistantMessage.findMany({
      where: { conversation: { organizationId } },
    }),
  dataExport: (organizationId) =>
    prisma.dataExport.findMany({ where: { organizationId } }),
  auditLog: (organizationId) =>
    prisma.auditLog.findMany({ where: { organizationId } }),
}

function toJson(rows: Record<string, unknown>[]) {
  return JSON.stringify(
    rows,
    (_key, value) =>
      typeof value === "bigint" ? value.toString() : (value as unknown),
    2
  )
}

/** Keeps archive paths readable and free of separators or control bytes. */
function safeName(name: string) {
  return name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "file"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
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
  requirePermission(ctx, "organization:export")

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

/**
 * Writes the archive straight into a new large object, so neither the JSON nor
 * the files are ever held in memory as a whole ZIP.
 *
 * Identity tables come from this database; every domain app contributes one
 * part through its export endpoint. File and attachment bytes are streamed
 * from the app that owns them, never read across a database.
 */
async function writeArchive(exportId: string, organizationId: string) {
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
  const addObject = async (path: string, oid: number) => {
    const entry = new ZipPassThrough(path)
    zip.add(entry)
    const { stream } = await openLargeObjectStream(oid)
    for await (const chunk of stream) {
      entry.push(chunk as Uint8Array)
      await drain()
    }
    entry.push(new Uint8Array(0), true)
  }
  const addRemote = async (path: string, app: string, id: string) => {
    const services = sagaServices()
    const baseUrl = services?.baseUrl(app)
    if (!services || !baseUrl) throw new Error(`No origin for ${app}`)
    const token = await services.tokens.getToken({
      audience: `urn:asynchrone:app:${app}`,
      scopes: ["internal:export:read"],
    })
    const response = await fetch(
      new URL(
        `${path}?organizationId=${encodeURIComponent(organizationId)}`,
        baseUrl
      ),
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    )
    if (!response.ok || !response.body) {
      throw new Error(`${app} export stream failed (${response.status})`)
    }
    const entry = new ZipPassThrough(`files/${app}/${id}`)
    zip.add(entry)
    const reader = response.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      entry.push(value, false)
      await drain()
    }
    entry.push(new Uint8Array(0), true)
  }

  try {
    const counts: Record<string, number> = {}
    for (const [table, read] of Object.entries(TABLES)) {
      const rows = (await read(organizationId)) as Record<string, unknown>[]
      counts[table] = rows.length
      await addText(`data/identity/${table}.json`, toJson(rows))
    }

    const { apps, clients } = sagaRemotes()
    const services = sagaServices()
    let files = 0

    for (const app of apps) {
      const client = clients[app]
      if (!client) continue
      const part = await client.exportOrganization(organizationId)
      const tables = part.manifest.tables
      for (const [table, rows] of Object.entries(part.data)) {
        counts[`${app}.${table}`] = rows.length
        await addText(
          `data/${app}/${table}.json`,
          toJson(rows as Record<string, unknown>[])
        )
      }
      const data = part.data

      if (app === "files" && services) {
        for (const row of data.fileNode ?? []) {
          if (!isRecord(row) || typeof row.id !== "string") continue
          if (row.oid === null || row.oid === undefined) continue
          await addRemote(
            `/internal/v1/files/${encodeURIComponent(row.id)}/content`,
            "files",
            `${row.id}-${safeName(String(row.name ?? "file"))}`
          )
          files++
        }
        for (const row of data.fileVersion ?? []) {
          if (!isRecord(row) || typeof row.id !== "string") continue
          if (row.oid === null || row.oid === undefined) continue
          const fileId = typeof row.fileId === "string" ? row.fileId : "file"
          await addRemote(
            `/internal/v1/files/versions/${encodeURIComponent(row.id)}/content`,
            "files",
            `versions/${fileId}/${row.id}-${safeName(String(row.name ?? "version"))}`
          )
          files++
        }
      }

      if (app === "messages" && services) {
        for (const row of data.messageAttachment ?? []) {
          if (!isRecord(row) || typeof row.id !== "string") continue
          if (row.oid === null || row.oid === undefined) continue
          await addRemote(
            `/internal/v1/messages/attachments/${encodeURIComponent(row.id)}/content`,
            "messages",
            `${row.id}-${safeName(String(row.name ?? "attachment"))}`
          )
          files++
        }
      }

      await prisma.dataExportApp.upsert({
        where: { exportId_app: { exportId, app } },
        create: {
          exportId,
          app,
          status: "complete",
          schemaVersion: part.manifest.schemaVersion,
          rowCount: Object.values(tables).reduce(
            (total, count) => total + count,
            0
          ),
          completedAt: new Date(),
        },
        update: {
          status: "complete",
          schemaVersion: part.manifest.schemaVersion,
          rowCount: Object.values(tables).reduce(
            (total, count) => total + count,
            0
          ),
          completedAt: new Date(),
        },
      })
    }

    await addText(
      "manifest.json",
      JSON.stringify(
        {
          organizationId,
          exportedAt: new Date().toISOString(),
          tables: counts,
          files,
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
    const { oid, size } = await writeArchive(exportId, job.organizationId)
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
