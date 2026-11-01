import { AUDIT_ACTIONS, recordAuditMany, type AuditDb } from "@workspace/audit"

/**
 * The twoFactor plugin flips the user flag only on these two endpoints: the
 * first verified code enrolls, `disable` removes. Any other user update
 * (profile, sign-in challenge) is not a 2FA change.
 */
export function twoFactorAuditAction(path: string | undefined) {
  if (path === "/two-factor/verify-totp")
    return AUDIT_ACTIONS.memberTwoFactorEnabled
  if (path === "/two-factor/disable")
    return AUDIT_ACTIONS.memberTwoFactorDisabled
  return null
}

export interface TwoFactorAuditDb extends AuditDb {
  member: {
    findMany(args: {
      where: { userId: string }
      select: { organizationId: true }
    }): PromiseLike<{ organizationId: string }[]>
  }
  user: {
    findUnique(args: {
      where: { id: string }
      select: { name: true; email: true }
    }): PromiseLike<{ name: string | null; email: string } | null>
  }
}

/** Build the customer 2FA audit writer over the identity database. */
export function createTwoFactorAudit(db: TwoFactorAuditDb) {
  /** Audit rows are organization-scoped, so the change is logged in each one. */
  async function recordTwoFactorChange(
    userId: string,
    path: string | undefined
  ) {
    const action = twoFactorAuditAction(path)
    if (!action) return
    const enabled = action === AUDIT_ACTIONS.memberTwoFactorEnabled
    const [memberships, user] = await Promise.all([
      db.member.findMany({
        where: { userId },
        select: { organizationId: true },
      }),
      db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      }),
    ])
    if (memberships.length === 0) return
    // The actor is the member themselves; identity is snapshotted so the row
    // stays readable once the account is gone.
    await recordAuditMany(
      memberships.map(({ organizationId }) => ({
        organizationId,
        actorId: userId,
        actorName: user?.name ?? null,
        actorEmail: user?.email ?? null,
        action,
        entityType: "user",
        entityId: userId,
        entityLabel: user?.email ?? null,
        before: { twoFactorEnabled: !enabled },
        after: { twoFactorEnabled: enabled },
      })),
      db
    )
  }

  return { recordTwoFactorChange }
}
