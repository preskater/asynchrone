import "dotenv/config"

import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"

import { unzipSync } from "fflate"

import type { RequestContext } from "@workspace/core/context"
import { openLargeObjectStream, uploadLargeObject } from "../lib/large-object"
import { deleteOrganization } from "../lib/organization/deletion-service"
import {
  processExports,
  requestExport,
} from "../lib/organization/export-service"
import { prisma } from "../lib/prisma"

/**
 * Manual check for organization data exports (issue #88), against a
 * throwaway organization in the configured database: owner-only requests, one
 * export in flight, archive contents matching the database, no secrets,
 * expiry and cleanup on organization deletion. Run with:
 *
 *   npm run verify:data-export
 */

const DAY = 24 * 60 * 60 * 1000

let failures = 0

function check(ok: boolean, message: string) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${message}`)
}

async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return "ok"
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

async function newLargeObject(text: string) {
  const { oid } = await uploadLargeObject(Readable.from([Buffer.from(text)]))
  return oid
}

async function readLargeObject(oid: bigint) {
  const { stream } = await openLargeObjectStream(Number(oid))
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return new Uint8Array(Buffer.concat(chunks))
}

async function largeObjectExists(oid: bigint) {
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count FROM pg_largeobject_metadata
    WHERE oid = ${String(oid)}::oid`
  return row?.count === 1n
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const orgId = `org_export_${suffix}`
  const owner = {
    id: `user_export_owner_${suffix}`,
    email: `owner-${suffix}@export.verify`,
  }
  const member = {
    id: `user_export_member_${suffix}`,
    email: `member-${suffix}@export.verify`,
  }
  const ctx = (
    user: { id: string; email: string },
    role: RequestContext["role"]
  ): RequestContext => ({
    userId: user.id,
    userName: user.id,
    userEmail: user.email,
    organizationId: orgId,
    role,
  })
  const decoder = new TextDecoder()

  try {
    const start = new Date()
    for (const user of [owner, member]) {
      await prisma.user.create({
        data: { id: user.id, name: user.id, email: user.email },
      })
    }
    await prisma.organization.create({
      data: {
        id: orgId,
        name: `Export ${suffix}`,
        slug: orgId.replaceAll("_", "-"),
        createdAt: start,
      },
    })
    for (const [user, role] of [
      [owner, "owner"],
      [member, "member"],
    ] as const) {
      await prisma.member.create({
        data: {
          id: `member_${user.id}`,
          organizationId: orgId,
          userId: user.id,
          role,
          createdAt: start,
        },
      })
    }

    const [currentOid, olderOid, attachmentOid] = await Promise.all([
      newLargeObject("current bytes"),
      newLargeObject("older bytes"),
      newLargeObject("attachment bytes"),
    ])
    const file = await prisma.fileNode.create({
      data: {
        organizationId: orgId,
        name: "notes/v2.txt",
        ownerId: owner.id,
        oid: currentOid,
      },
    })
    await prisma.fileVersion.create({
      data: { fileId: file.id, userId: owner.id, note: "v2", oid: currentOid },
    })
    const older = await prisma.fileVersion.create({
      data: { fileId: file.id, userId: owner.id, note: "v1", oid: olderOid },
    })
    const conversation = await prisma.conversation.create({
      data: { organizationId: orgId, name: "general" },
    })
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, authorId: owner.id, body: "hi" },
    })
    const attachment = await prisma.messageAttachment.create({
      data: { messageId: message.id, name: "a.txt", oid: attachmentOid },
    })
    const project = await prisma.project.create({
      data: { organizationId: orgId, name: "Repo project" },
    })
    await prisma.repositoryConnection.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        provider: "github",
        owner: "acme",
        repo: "app",
        repoUrl: "https://github.com/acme/app",
        webhookSecret: `secret-${suffix}`,
        createdById: owner.id,
      },
    })

    // Requests
    check(
      (await outcome(() => requestExport(ctx(member, "member")))) ===
        "forbidden",
      "a member cannot request an export"
    )
    const { id: exportId } = await requestExport(ctx(owner, "owner"))
    check(
      (await outcome(() => requestExport(ctx(owner, "owner")))) ===
        "export_in_progress",
      "only one export can be in flight"
    )

    // Build
    const firstRun = await processExports(start)
    const ready = await prisma.dataExport.findUniqueOrThrow({
      where: { id: exportId },
    })
    check(
      firstRun.built >= 1 && ready.status === "ready" && ready.oid !== null,
      "the cron builds the export"
    )
    check(
      ready.expiresAt !== null &&
        Math.abs(ready.expiresAt.getTime() - Date.now() - 7 * DAY) < 60_000,
      "the archive expires 7 days after it is built"
    )
    check(
      (await processExports(start)).built === 0,
      "a second run builds nothing"
    )

    const archive = unzipSync(await readLargeObject(ready.oid!))
    const json = (path: string) =>
      JSON.parse(decoder.decode(archive[path])) as Record<string, unknown>[]
    const manifest = JSON.parse(decoder.decode(archive["manifest.json"])) as {
      tables: Record<string, number>
      files: number
    }
    check(
      Object.entries(manifest.tables).every(
        ([table, count]) => json(`data/${table}.json`).length === count
      ),
      "every data file matches the manifest count"
    )
    const expected: Record<string, number> = {
      member: 2,
      fileNode: 1,
      fileVersion: 2,
      message: 1,
      messageAttachment: 1,
      repositoryConnection: 1,
    }
    check(
      Object.entries(expected).every(
        ([table, count]) => manifest.tables[table] === count
      ),
      `record counts match the database (${JSON.stringify(expected)})`
    )
    check(
      decoder.decode(archive[`files/${file.id}-notes_v2.txt`]) ===
        "current bytes" &&
        decoder.decode(
          archive[`files/versions/${file.id}/${older.id}-notes_v2.txt`]
        ) === "older bytes" &&
        decoder.decode(archive[`attachments/${attachment.id}-a.txt`]) ===
          "attachment bytes" &&
        manifest.files === 3,
      "files, older versions and attachments are included once each"
    )
    check(
      !decoder
        .decode(archive["data/repositoryConnection.json"])
        .includes(`secret-${suffix}`),
      "credentials are left out"
    )

    // Expiry
    const expiry = await processExports(new Date(Date.now() + 8 * DAY))
    const expired = await prisma.dataExport.findUniqueOrThrow({
      where: { id: exportId },
    })
    check(
      expiry.expired >= 1 &&
        expired.status === "expired" &&
        !(await largeObjectExists(ready.oid!)),
      "an expired archive is unlinked"
    )

    // Organization deletion
    const { id: secondId } = await requestExport(ctx(owner, "owner"))
    await processExports(start)
    const second = await prisma.dataExport.findUniqueOrThrow({
      where: { id: secondId },
    })
    await prisma.organization.update({
      where: { id: orgId },
      data: { deletionScheduledAt: start },
    })
    await deleteOrganization(orgId, new Date(start.getTime() + 1000))
    check(
      second.oid !== null && !(await largeObjectExists(second.oid)),
      "deleting the organization unlinks its export archives"
    )
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: orgId } })
      .catch(() => {})
    await prisma.platformAuditEvent
      .deleteMany({ where: { organizationId: orgId } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, member.id] } } })
      .catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} data export check(s) failed`)
    process.exitCode = 1
  } else {
    console.log("\nAll data export checks passed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
