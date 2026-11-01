import { prisma } from "@/lib/prisma"

import { AUDIT_ACTIONS } from "./actions"
import { recordAudit } from "./record"
import { requestMetaFromHeaders } from "./request-meta"

/**
 * Organization changes made through the Better Auth HTTP endpoints (member
 * roles, removals, invitations, workspace name) never pass through a server
 * action, so they are audited from the auth `after` hook instead. Better Auth's
 * `organizationHooks` only receive the *target* member, not the actor; the
 * global hook has the request headers, which is what an audit trail needs.
 *
 * The hook runs after the change is committed, so a failed audit write is
 * logged rather than turned into an error the caller cannot act on.
 */

export interface SessionUser {
  id: string
  name?: string | null
  email?: string | null
}

export interface SessionLike {
  user: SessionUser
  session: { activeOrganizationId?: string | null }
}

/**
 * Resolves the acting session from the request headers. Better Auth's `after`
 * hook context does not expose the session its endpoint middleware resolved, so
 * `lib/auth.ts` passes its own lookup here (`auth.api.getSession`).
 */
export type SessionResolver = (headers: Headers) => Promise<SessionLike | null>

interface AuthHookContext {
  path?: string
  body?: Record<string, unknown>
  headers?: Headers
  context: { returned?: unknown }
}

const HANDLED_PATHS = new Set([
  "/organization/update",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/leave",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
])

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null
}

function nested(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  return record(value[key])
}

async function emailFor(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  return user?.email ?? null
}

/**
 * Records one audit row for an organization endpoint. Safe to call for every
 * auth request: unhandled paths return immediately.
 */
export async function recordAuthAuditEvent(
  rawContext: unknown,
  resolveSession?: SessionResolver
): Promise<void> {
  const ctx = rawContext as AuthHookContext
  const path = ctx.path
  if (!path || !HANDLED_PATHS.has(path)) return

  try {
    const session = resolveSession
      ? await resolveSession(ctx.headers ?? new Headers())
      : null
    if (!session?.user?.id) return

    const body = record(ctx.body)
    const returned = record(ctx.context.returned)
    const organizationId =
      text(returned.organizationId) ??
      text(body.organizationId) ??
      text(nested(returned, "member").organizationId) ??
      text(nested(returned, "invitation").organizationId) ??
      text(returned.id) ??
      session.session.activeOrganizationId ??
      null
    if (!organizationId) return

    const meta = requestMetaFromHeaders(ctx.headers ?? new Headers())
    const actor = {
      organizationId,
      actorId: session.user.id,
      actorName: session.user.name ?? null,
      actorEmail: session.user.email ?? null,
      ...meta,
    }

    switch (path) {
      case "/organization/update-member-role": {
        const userId = text(returned.userId)
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationMemberRoleChanged,
          entityType: "member",
          entityId: userId ?? text(body.memberId) ?? "unknown",
          entityLabel: await emailFor(userId),
          after: { role: text(returned.role) },
        })
        return
      }

      case "/organization/remove-member": {
        const member = nested(returned, "member")
        const userId = text(member.userId)
        const email = (await emailFor(userId)) ?? text(body.memberIdOrEmail)
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationMemberRemoved,
          entityType: "member",
          entityId: userId ?? text(body.memberIdOrEmail) ?? "unknown",
          entityLabel: email,
          before: { role: text(member.role) },
        })
        return
      }

      case "/organization/leave": {
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationMemberLeft,
          entityType: "member",
          entityId: session.user.id,
          entityLabel: session.user.email ?? null,
          before: { role: text(returned.role) },
        })
        return
      }

      case "/organization/invite-member": {
        const invitationId = text(returned.id) ?? text(body.id) ?? "unknown"
        const email = text(returned.email) ?? text(body.email)
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationInvitationCreated,
          entityType: "invitation",
          entityId: invitationId,
          entityLabel: email,
          after: { email, role: text(returned.role) ?? text(body.role) },
        })
        return
      }

      case "/organization/cancel-invitation": {
        const invitationId =
          text(returned.id) ?? text(body.invitationId) ?? "unknown"
        const email = text(returned.email)
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationInvitationCancelled,
          entityType: "invitation",
          entityId: invitationId,
          entityLabel: email,
          before: { email, role: text(returned.role) },
        })
        return
      }

      case "/organization/accept-invitation": {
        const invitation = nested(returned, "invitation")
        const invitationId =
          text(invitation.id) ?? text(body.invitationId) ?? "unknown"
        const email = text(invitation.email) ?? session.user.email ?? null
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationInvitationAccepted,
          entityType: "invitation",
          entityId: invitationId,
          entityLabel: email,
          after: { email, role: text(nested(returned, "member").role) },
        })
        return
      }

      case "/organization/reject-invitation": {
        const invitation = nested(returned, "invitation")
        const invitationId =
          text(invitation.id) ?? text(body.invitationId) ?? "unknown"
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationInvitationRejected,
          entityType: "invitation",
          entityId: invitationId,
          entityLabel: text(invitation.email) ?? session.user.email ?? null,
          before: { email: text(invitation.email) },
        })
        return
      }

      case "/organization/update": {
        const data = nested(body, "data")
        if (Object.keys(data).length === 0) return
        await recordAudit({
          ...actor,
          action: AUDIT_ACTIONS.organizationUpdated,
          entityType: "organization",
          entityId: organizationId,
          entityLabel: text(returned.name),
          after: {
            name: text(returned.name),
            slug: text(returned.slug),
          },
        })
        return
      }

      default:
        return
    }
  } catch (error) {
    console.error("[audit] failed to record an organization event", error)
  }
}
