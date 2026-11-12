import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "@workspace/core/errors"
import { sendAccountDeletedEmail } from "@/lib/email"
import { parseRoles } from "@workspace/organization/roles"
import { prisma } from "@/lib/prisma"

export const DELETED_USER_NAME = "Deleted user"

/**
 * Organizations this user is the only owner of and that are not already
 * scheduled for deletion: deleting the account would leave them ownerless.
 */
export async function soleOwnedOrganizations(userId: string) {
  const owned = await prisma.member.findMany({
    where: { userId, role: { contains: "owner" } },
    select: {
      organization: {
        select: {
          id: true,
          name: true,
          deletionScheduledAt: true,
          members: { select: { userId: true, role: true } },
        },
      },
    },
  })
  return owned
    .map(({ organization }) => organization)
    .filter(
      (org) =>
        !org.deletionScheduledAt &&
        org.members.every(
          (member) =>
            member.userId === userId ||
            !parseRoles(member.role).includes("owner")
        )
    )
    .map(({ id, name }) => ({ id, name }))
}

/**
 * Deletes a personal account by anonymizing it. The `user` row stays so the
 * many plain `userId`/`authorId` columns (content, employee records kept by the
 * employer) keep pointing at something that renders as "Deleted user"; every
 * credential, session and membership is removed, so the person can never sign
 * in again and can sign up afresh with the same address. Password and
 * impersonation checks happen in the action, which owns the request.
 */
export async function assertAccountDeletable(
  userId: string,
  confirmEmail: string
): Promise<{ email: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  })
  if (!user) throw new ForbiddenError()
  if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new ValidationError("The email address does not match.", undefined, {
      code: "account_confirmation_mismatch",
    })
  }
  // `user.role` holds platform roles, not organization roles.
  const platformRoles = (user.role ?? "").split(",").map((role) => role.trim())
  if (platformRoles.some((role) => role.startsWith("platform_"))) {
    throw new ForbiddenError("Platform operator accounts cannot be deleted.", {
      code: "account_platform_operator",
    })
  }
  const soleOwned = await soleOwnedOrganizations(userId)
  if (soleOwned.length > 0) {
    throw new ConflictError("Transfer or delete your organizations first.", {
      code: "account_sole_owner",
      params: { organizations: soleOwned.map((org) => org.name).join(", ") },
    })
  }
  return { email: user.email }
}

/**
 * The identity step of the account-deletion saga.
 *
 * Domain apps anonymize their rows first; this runs last so a failed domain
 * deletion keeps the account and can be retried.
 */
export async function anonymizeUserIdentity(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  })
  if (!user) return

  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
  })

  const anonymizedEmail = `deleted-${userId}@deleted.invalid`
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: DELETED_USER_NAME,
        email: anonymizedEmail,
        emailVerified: false,
        image: null,
        twoFactorEnabled: false,
        customerTwoFactorEnabled: false,
        lastSeenAt: null,
        // Belt and braces: nothing can sign in to the anonymized row.
        banned: true,
        banReason: "account deleted",
      },
    })
    await tx.session.deleteMany({ where: { userId } })
    await tx.account.deleteMany({ where: { userId } })
    await tx.twoFactor.deleteMany({ where: { userId } })
    await tx.customerTwoFactor.deleteMany({ where: { userId } })
    // A pending reset token would otherwise recreate a credential account.
    await tx.verification.deleteMany({ where: { value: userId } })
    await tx.teamMember.deleteMany({ where: { userId } })
    await tx.member.deleteMany({ where: { userId } })
    await tx.invitation.deleteMany({ where: { inviterId: userId } })
    await tx.oauthAccessToken.deleteMany({ where: { userId } })
    await tx.oauthRefreshToken.deleteMany({ where: { userId } })
    await tx.oauthConsent.deleteMany({ where: { userId } })
    await tx.notification.deleteMany({ where: { userId } })
    await tx.assistantConversation.deleteMany({ where: { userId } })

    for (const { organizationId } of memberships) {
      await tx.auditLog.create({
        data: {
          organizationId,
          actorId: userId,
          action: "member.account_deleted",
          entityType: "user",
          entityId: userId,
        },
      })
    }
    console.info("[account-deletion] identity anonymized", {
      userId,
      organizations: memberships.length,
    })
  })

  sendAccountDeletedEmail({ to: user.email })
}

/** Direct path kept for callers that do not run the cross-app saga. */
export async function deleteAccount(userId: string, confirmEmail: string) {
  await assertAccountDeletable(userId, confirmEmail)
  await anonymizeUserIdentity(userId)
}
