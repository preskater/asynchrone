import "dotenv/config"

import { randomUUID } from "node:crypto"
import { Readable } from "node:stream"

import type { RequestContext } from "@workspace/core/context"
import { uploadLargeObject } from "../lib/large-object"
import {
  cancelOrganizationDeletion,
  deleteOrganization,
  requestOrganizationDeletion,
} from "../lib/organization/deletion-service"
import { prisma } from "../lib/prisma"

/**
 * Manual check for organization deletion (issue #88), against a throwaway
 * organization in the configured database: request and cancel rules, the
 * grace period, then deletion with no orphan rows and no remaining large
 * objects. The clock is simulated by passing `now` to the services. Run with:
 *
 *   npm run verify:organization-deletion
 */

const DAY = 24 * 60 * 60 * 1000

/** Tables allowed to keep rows for a deleted organization. */
const KEPT_TABLES = new Set(["platformAuditEvent", "trialClaim"])

let failures = 0

function check(ok: boolean, message: string) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${message}`)
}

/** The error code, or "ok" when the call succeeded. */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return "ok"
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

async function newLargeObject() {
  const { oid } = await uploadLargeObject(Readable.from([Buffer.from("bytes")]))
  return oid
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const orgId = `org_deletion_${suffix}`
  const orgName = `Deletion ${suffix}`
  const owner = {
    id: `user_deletion_owner_${suffix}`,
    email: `owner-${suffix}@deletion.verify`,
  }
  const member = {
    id: `user_deletion_member_${suffix}`,
    email: `member-${suffix}@deletion.verify`,
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

  try {
    const start = new Date()
    for (const user of [owner, member]) {
      await prisma.user.create({
        data: {
          id: user.id,
          name: user.id,
          email: user.email,
          emailVerified: true,
        },
      })
    }
    await prisma.organization.create({
      data: {
        id: orgId,
        name: orgName,
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

    // One large object per table that references them.
    const oids = await Promise.all([1, 2, 3, 4].map(() => newLargeObject()))
    const file = await prisma.fileNode.create({
      data: {
        organizationId: orgId,
        name: "a.txt",
        ownerId: owner.id,
        oid: oids[0],
      },
    })
    await prisma.fileVersion.create({
      data: { fileId: file.id, userId: owner.id, note: "v1", oid: oids[1] },
    })
    await prisma.uploadSession.create({
      data: {
        organizationId: orgId,
        userId: owner.id,
        name: "b.txt",
        oid: oids[2]!,
        expiresAt: new Date(start.getTime() + DAY),
      },
    })
    const conversation = await prisma.conversation.create({
      data: { organizationId: orgId, name: "general" },
    })
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, authorId: owner.id, body: "hi" },
    })
    await prisma.messageAttachment.create({
      data: { messageId: message.id, name: "c.txt", oid: oids[3] },
    })

    // Request and cancel
    check(
      (await outcome(() =>
        requestOrganizationDeletion(ctx(member, "member"), orgName, start)
      )) === "forbidden",
      "a member cannot request deletion"
    )
    check(
      (await outcome(() =>
        requestOrganizationDeletion(ctx(owner, "owner"), "wrong", start)
      )) === "validation_error",
      "a wrong confirmation name is refused"
    )
    const { deletionScheduledAt } = await requestOrganizationDeletion(
      ctx(owner, "owner"),
      orgName,
      start
    )
    check(
      deletionScheduledAt.getTime() - start.getTime() === 30 * DAY,
      "deletion is scheduled 30 days ahead"
    )
    check(
      (await outcome(() =>
        requestOrganizationDeletion(ctx(owner, "owner"), orgName, start)
      )) === "conflict",
      "a second request does not move the date"
    )
    await cancelOrganizationDeletion(ctx(owner, "owner"))
    const cancelled = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { deletionScheduledAt: true },
    })
    check(cancelled?.deletionScheduledAt === null, "an owner can cancel")
    check(
      (await deleteOrganization(
        orgId,
        new Date(start.getTime() + 31 * DAY)
      )) === false,
      "a cancelled organization is never deleted"
    )

    // Grace period, then deletion
    await requestOrganizationDeletion(ctx(owner, "owner"), orgName, start)
    check(
      (await deleteOrganization(
        orgId,
        new Date(start.getTime() + 29 * DAY)
      )) === false,
      "nothing is deleted during the grace period"
    )
    const after = new Date(start.getTime() + 31 * DAY)
    check(
      await deleteOrganization(orgId, after),
      "the organization is deleted once due"
    )
    check(
      (await deleteOrganization(orgId, after)) === false,
      "a second run does nothing"
    )

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND column_name = 'organizationId'`
    const leftovers: string[] = []
    for (const { table_name } of tables) {
      if (KEPT_TABLES.has(table_name)) continue
      const [row] = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*) AS count FROM "${table_name}" WHERE "organizationId" = $1`,
        orgId
      )
      if (row && row.count > 0n) leftovers.push(table_name)
    }
    check(
      leftovers.length === 0,
      `no orphan rows (${leftovers.join(", ") || "none"})`
    )
    check(
      (await prisma.messageAttachment.count({
        where: { messageId: message.id },
      })) === 0,
      "message attachments are gone"
    )

    const [objects] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM pg_largeobject_metadata
      WHERE oid = ANY(${oids.map(String)}::oid[])`
    check(objects?.count === 0n, "every large object is unlinked")

    const event = await prisma.platformAuditEvent.findFirst({
      where: { organizationId: orgId, action: "organization.deleted" },
    })
    check(event !== null, "a PlatformAuditEvent records the deletion")
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: orgId } })
      .catch(() => {})
    await prisma.uploadSession
      .deleteMany({ where: { organizationId: orgId } })
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
    console.error(`\n${failures} organization deletion check(s) failed`)
    process.exitCode = 1
  } else {
    console.log("\nAll organization deletion checks passed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
