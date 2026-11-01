import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import type { RequestContext } from "@workspace/core/context"
import { requirePermission } from "@/lib/core/auth-context"
import { ConflictError, ValidationError } from "@workspace/core/errors"
import { sendOrganizationDeletedEmail } from "@/lib/email"
import { snapshotForOrganization } from "@/lib/files"
import { unlinkLargeObject } from "@/lib/large-object"
import { snapshotMessagingForOrganization } from "@/lib/messaging"
import { prisma } from "@/lib/prisma"

/** Matches the privacy policy: data is removed within 30 days of the request. */
import { ORGANIZATION_DELETION_GRACE_DAYS } from "@workspace/organization/lifecycle"

export const DELETION_GRACE_DAYS = ORGANIZATION_DELETION_GRACE_DAYS

const DAY = 24 * 60 * 60 * 1000

export async function getDeletionScheduledAt(
  organizationId: string
): Promise<Date | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { deletionScheduledAt: true },
  })
  return org?.deletionScheduledAt ?? null
}

/**
 * Schedules the active organization for deletion after the grace period. The
 * owner retypes the organization name, mirroring the confirmation dialog.
 */
export async function requestOrganizationDeletion(
  ctx: RequestContext,
  confirmName: string,
  now = new Date()
) {
  requirePermission(ctx, ["owner"])

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true },
  })
  if (!org || confirmName !== org.name) {
    throw new ValidationError("The organization name does not match.")
  }

  const deletionScheduledAt = new Date(
    now.getTime() + DELETION_GRACE_DAYS * DAY
  )
  await prisma.$transaction(async (tx) => {
    // Conditional update: a second request never moves the date.
    const { count } = await tx.organization.updateMany({
      where: { id: ctx.organizationId, deletionScheduledAt: null },
      data: { deletionScheduledAt, deletionRequestedById: ctx.userId },
    })
    if (count === 0) {
      throw new ConflictError("Deletion is already scheduled.")
    }
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationDeletionRequest,
        entityType: "organization",
        entityId: ctx.organizationId,
        after: { deletionScheduledAt: deletionScheduledAt.toISOString() },
      },
      tx
    )
  })

  return { deletionScheduledAt }
}

export async function cancelOrganizationDeletion(ctx: RequestContext) {
  requirePermission(ctx, ["owner"])

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.organization.updateMany({
      where: { id: ctx.organizationId, deletionScheduledAt: { not: null } },
      data: { deletionScheduledAt: null, deletionRequestedById: null },
    })
    if (count === 0) {
      throw new ConflictError("No deletion is scheduled.")
    }
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationDeletionCancel,
        entityType: "organization",
        entityId: ctx.organizationId,
      },
      tx
    )
  })
}

/**
 * Deletes one organization whose grace period has passed. Rows go through the
 * schema's `onDelete: Cascade`; tables without a foreign key are cleared here.
 * Two records survive on purpose: a `PlatformAuditEvent` (the proof of the
 * deletion) and the `TrialClaim` rows (email/domain) that stop a deleted
 * workspace from claiming a second Team trial. Both are disclosed in the
 * privacy policy's retention clause (`packages/i18n/messages/<locale>/legal.json`).
 * Large objects are unlinked only after the delete commits, so a failed
 * delete never loses file bytes. Returns false when there was nothing to do.
 * See ADR 0024.
 */
export async function deleteOrganization(
  organizationId: string,
  now = new Date()
): Promise<boolean> {
  const where = {
    id: organizationId,
    deletionScheduledAt: { lte: now },
  }
  const org = await prisma.organization.findFirst({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      deletionScheduledAt: true,
      deletionRequestedById: true,
    },
  })
  if (!org) return false

  // The files app owns the file/version/upload bytes; list them before the
  // delete cascades and unlink them after it commits.
  const fileObjects = await snapshotForOrganization(organizationId)
  // The messages app owns the attachment bytes; same list-before-delete rule.
  const messagingObjects =
    await snapshotMessagingForOrganization(organizationId)

  const [exports, owners, memberCount] = await Promise.all([
    prisma.dataExport.findMany({
      where: { organizationId, oid: { not: null } },
      select: { oid: true },
    }),
    prisma.member.findMany({
      where: { organizationId, role: { contains: "owner" } },
      select: { user: { select: { email: true } } },
    }),
    prisma.member.count({ where: { organizationId } }),
  ])
  const oids = [
    ...new Set([
      ...fileObjects.oids,
      ...messagingObjects.oids,
      ...exports.map(({ oid }) => Number(oid)),
    ]),
  ]

  const deleted = await prisma.$transaction(async (tx) => {
    // Conditional delete: a cancel that lands first wins.
    const { count } = await tx.organization.deleteMany({ where })
    if (count === 0) return false
    await tx.uploadSession.deleteMany({ where: { organizationId } })
    await tx.platformHandoff.deleteMany({ where: { organizationId } })
    await tx.platformAuditEvent.create({
      data: {
        actorId: "system",
        actorEmail: "system",
        actorRole: "system",
        action: "organization.deleted",
        targetType: "organization",
        targetId: organizationId,
        organizationId,
        before: {
          name: org.name,
          slug: org.slug,
          requestedById: org.deletionRequestedById,
          scheduledFor: org.deletionScheduledAt?.toISOString() ?? null,
          members: memberCount,
          largeObjects: oids.length,
        },
      },
    })
    return true
  })
  if (!deleted) return false

  // ponytail: an unlink that fails here leaves an orphan large object; the
  // verify:organization-deletion script reports them. Add a sweep if it happens.
  await fileObjects.unlink()
  await messagingObjects.unlink()
  for (const { oid } of exports) {
    const value = Number(oid)
    await unlinkLargeObject(value).catch((error) => {
      console.error(`[organization-deletion] unlink ${value} failed`, error)
    })
  }

  for (const { user } of owners) {
    sendOrganizationDeletedEmail({ to: user.email, organizationName: org.name })
  }

  return true
}

/** Daily job: deletes every organization whose grace period has passed. */
export async function processOrganizationDeletions(now = new Date()) {
  const due = await prisma.organization.findMany({
    where: { deletionScheduledAt: { lte: now } },
    select: { id: true },
  })

  let deleted = 0
  for (const { id } of due) {
    if (await deleteOrganization(id, now)) deleted++
  }
  return { deleted }
}
