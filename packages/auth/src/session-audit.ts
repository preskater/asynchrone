import type { AuditDb } from "@workspace/audit"

const SESSION_AUDIT_ACTIONS: Record<string, string> = {
  "/revoke-session": "member.session_revoked",
  "/revoke-other-sessions": "member.other_sessions_revoked",
  "/revoke-sessions": "member.sessions_revoked",
}

/** Audit action for a Better Auth session-revocation endpoint, else null. */
export function sessionAuditAction(path: string | undefined) {
  return (path && SESSION_AUDIT_ACTIONS[path]) || null
}

export interface SessionAuditDb extends AuditDb {
  member: {
    findMany(args: {
      where: { userId: string }
      select: { organizationId: true }
    }): PromiseLike<{ organizationId: string }[]>
  }
}

/** Build the session-revocation audit writer over the identity database. */
export function createSessionAudit(db: SessionAuditDb) {
  /** Audit rows are organization-scoped, so the event is logged in each one. */
  async function recordSessionRevocation(
    userId: string,
    path: string | undefined
  ) {
    const action = sessionAuditAction(path)
    if (!action) return
    const memberships = await db.member.findMany({
      where: { userId },
      select: { organizationId: true },
    })
    if (memberships.length === 0) return
    await db.auditLog.createMany({
      data: memberships.map(({ organizationId }) => ({
        organizationId,
        actorId: userId,
        action,
        entityType: "user",
        entityId: userId,
        actorName: null,
        actorEmail: null,
        entityLabel: null,
        ipAddress: null,
        userAgent: null,
      })),
    })
  }

  return { recordSessionRevocation }
}
