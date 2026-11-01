import type { RequestContext } from "@workspace/core/context"
import { requirePermission } from "@/lib/core/auth-context"
import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordUserAudit } from "@/lib/audit/record"
import { requireEntitlement } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

/**
 * The workspace gate. A stored policy only applies while the plan includes it,
 * so a downgrade lifts it without rewriting the setting. Impersonating staff
 * cannot enroll on the user's behalf, so they are let through.
 */
export function mustEnrollTwoFactor({
  required,
  entitled,
  enrolled,
  impersonated,
}: {
  required: boolean
  entitled: boolean
  enrolled: boolean
  impersonated: boolean
}) {
  return required && entitled && !enrolled && !impersonated
}

/** Owners and admins see the setting and who still has to enroll. */
export async function getTwoFactorPolicy(ctx: RequestContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") return null
  const [organization, missing] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { requireTwoFactor: true },
    }),
    prisma.member.findMany({
      where: {
        organizationId: ctx.organizationId,
        // Client-portal accounts never reach the workspace gate.
        clientId: null,
        user: {
          OR: [
            { customerTwoFactorEnabled: false },
            { customerTwoFactorEnabled: null },
          ],
        },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ])
  return {
    required: organization?.requireTwoFactor ?? false,
    missing: missing.map(({ user }) => user),
  }
}

export async function setTwoFactorRequired(
  ctx: RequestContext,
  required: boolean
) {
  requirePermission(ctx, ["owner", "admin"])
  // Turning it off is always allowed, so a downgraded org can clear it.
  if (required) await requireEntitlement(ctx.organizationId, "requireTwoFactor")

  await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, requireTwoFactor: true },
    })
    if (before.requireTwoFactor === required) return
    await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { requireTwoFactor: required },
    })
    await recordUserAudit(
      ctx,
      {
        action: AUDIT_ACTIONS.organizationTwoFactorPolicyUpdated,
        entityType: "organization",
        entityId: ctx.organizationId,
        entityLabel: before.name,
        before: { requireTwoFactor: before.requireTwoFactor },
        after: { requireTwoFactor: required },
      },
      tx
    )
  })
}
