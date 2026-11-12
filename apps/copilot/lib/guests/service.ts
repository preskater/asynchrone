import { createHash, randomBytes } from "node:crypto"

import { AUDIT_ACTIONS, type UserAuditInput } from "@workspace/audit"
import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import {
  guestGrantUsable,
  guestInvitationOpen,
  parseGuestCapabilities,
  type GuestCapability,
} from "@workspace/core/guests"
import { can } from "@workspace/core/roles"
import type { PrismaClient } from "@workspace/db-identity"
import { upgradeRequired } from "@workspace/organization/entitlements"

/**
 * External collaborators (ADR 0041): project-scoped grants for people outside
 * the organization.
 *
 * A grant is never a membership. It takes no seat, it is invisible to every
 * workspace gate (they all require a `member` row), and each guest request is
 * re-resolved from the grant here, so a revocation or an expiry ends access on
 * the very next request.
 */

export type GuestUser = { id: string; name: string; email: string }

export type GuestState = "invited" | "active" | "expired" | "revoked"

export interface GuestView {
  id: string
  projectId: string
  projectName: string
  email: string
  name: string | null
  state: GuestState
  capabilities: GuestCapability[]
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

/** What a guest request runs as: the grant, never a workspace member. */
export interface GuestContext {
  grantId: string
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  organizationName: string
  projectId: string
  projectName: string
  capabilities: GuestCapability[]
  expiresAt: Date
}

export interface GuestServiceDeps {
  db: Pick<PrismaClient, "projectGuest" | "member" | "organization">
  /** The project as the inviting member sees it, or null. */
  findProject(
    ctx: RequestContext,
    projectId: string
  ): Promise<{ id: string; name: string } | null>
  /** External collaborators allowed per project on the organization's plan. */
  guestLimit(organizationId: string): Promise<number>
  audit(
    actor: Pick<
      RequestContext,
      "organizationId" | "userId" | "userName" | "userEmail"
    >,
    input: UserAuditInput
  ): Promise<void>
  sendInvitation(input: {
    to: string
    inviterName: string
    organizationName: string
    projectName: string
    expiresAt: Date
    url: string
  }): void
  acceptUrl(token: string): string
  now?: () => Date
}

const DAY_MS = 24 * 60 * 60 * 1000

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

type GrantRow = {
  id: string
  projectId: string
  projectName: string
  email: string
  status: string
  capabilities: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
  user?: { name: string } | null
}

function stateOf(row: GrantRow, now: Date): GuestState {
  if (row.status === "revoked") return "revoked"
  if (row.expiresAt.getTime() <= now.getTime()) return "expired"
  return row.status === "active" ? "active" : "invited"
}

function view(row: GrantRow, now: Date): GuestView {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    email: row.email,
    name: row.user?.name ?? null,
    state: stateOf(row, now),
    capabilities: parseGuestCapabilities(row.capabilities),
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
  }
}

function requireManager(ctx: RequestContext) {
  if (!can(ctx, "member:manage")) {
    throw new ForbiddenError(
      "Your role cannot manage external collaborators.",
      {
        code: "role_cannot_manage_members",
      }
    )
  }
}

export function createGuestService(deps: GuestServiceDeps) {
  const { db } = deps
  const now = () => deps.now?.() ?? new Date()

  async function invite(
    ctx: RequestContext,
    input: {
      projectId: string
      email: string
      expiresInDays: number
      capabilities: readonly string[]
    }
  ): Promise<{ guest: GuestView; inviteUrl: string }> {
    requireManager(ctx)
    const limit = await deps.guestLimit(ctx.organizationId)
    if (limit <= 0) throw upgradeRequired("externalCollaborators")

    const project = await deps.findProject(ctx, input.projectId)
    if (!project) throw new NotFoundError("Project")

    const email = input.email.trim().toLowerCase()
    const member = await db.member.findFirst({
      where: {
        organizationId: ctx.organizationId,
        user: { email: { equals: email, mode: "insensitive" } },
      },
      select: { id: true },
    })
    if (member) {
      throw new ConflictError("This person is already a member.", {
        code: "email_already_member",
      })
    }

    const at = now()
    const open = await db.projectGuest.findMany({
      where: {
        organizationId: ctx.organizationId,
        projectId: project.id,
        status: { in: ["invited", "active"] },
        expiresAt: { gt: at },
      },
      select: { email: true },
    })
    if (open.some((grant) => grant.email === email)) {
      throw new ConflictError("This person is already invited.", {
        code: "guest_already_invited",
      })
    }
    if (open.length >= limit) {
      throw new ForbiddenError("The plan's guest limit is reached.", {
        code: "guest_limit_reached",
        params: { limit },
      })
    }

    const token = randomBytes(32).toString("base64url")
    const capabilities = parseGuestCapabilities(input.capabilities)
    const expiresAt = new Date(at.getTime() + input.expiresInDays * DAY_MS)
    const row = await db.projectGuest.create({
      data: {
        organizationId: ctx.organizationId,
        projectId: project.id,
        projectName: project.name,
        email,
        capabilities: capabilities.join(","),
        tokenHash: hashGuestToken(token),
        expiresAt,
        invitedById: ctx.userId,
      },
    })
    await deps.audit(ctx, {
      action: AUDIT_ACTIONS.projectGuestInvited,
      entityType: "projectGuest",
      entityId: row.id,
      entityLabel: `${email} · ${project.name}`,
      after: {
        projectId: project.id,
        email,
        capabilities,
        expiresAt: expiresAt.toISOString(),
      },
    })

    const organization = await db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    })
    const inviteUrl = deps.acceptUrl(token)
    deps.sendInvitation({
      to: email,
      inviterName: ctx.userName,
      organizationName: organization?.name ?? "",
      projectName: project.name,
      expiresAt,
      url: inviteUrl,
    })
    return { guest: view(row, at), inviteUrl }
  }

  async function list(ctx: RequestContext): Promise<GuestView[]> {
    requireManager(ctx)
    const rows = await db.projectGuest.findMany({
      where: { organizationId: ctx.organizationId, status: { not: "revoked" } },
      include: { user: { select: { name: true } } },
      orderBy: [{ projectName: "asc" }, { createdAt: "asc" }],
    })
    const at = now()
    return rows.map((row) => view(row, at))
  }

  async function revoke(ctx: RequestContext, id: string): Promise<void> {
    requireManager(ctx)
    const row = await db.projectGuest.findFirst({
      where: { id, organizationId: ctx.organizationId },
    })
    if (!row) throw new NotFoundError("Guest")
    if (row.status === "revoked") return
    await db.projectGuest.update({
      where: { id: row.id },
      data: { status: "revoked", revokedAt: now() },
    })
    await deps.audit(ctx, {
      action: AUDIT_ACTIONS.projectGuestRevoked,
      entityType: "projectGuest",
      entityId: row.id,
      entityLabel: `${row.email} · ${row.projectName}`,
      before: { status: row.status },
      after: { status: "revoked" },
    })
  }

  /** The invitation behind a link, for the acceptance page. */
  async function preview(token: string) {
    const row = await db.projectGuest.findUnique({
      where: { tokenHash: hashGuestToken(token) },
      include: { organization: { select: { name: true } } },
    })
    if (!row) return null
    return {
      email: row.email,
      projectName: row.projectName,
      organizationName: row.organization.name,
      expiresAt: row.expiresAt,
      open: guestInvitationOpen(row, now()),
    }
  }

  async function accept(user: GuestUser, token: string): Promise<string> {
    const row = await db.projectGuest.findUnique({
      where: { tokenHash: hashGuestToken(token) },
    })
    if (!row || !guestInvitationOpen(row, now())) {
      throw new ValidationError(
        "The invitation is no longer valid.",
        undefined,
        {
          code: "guest_invitation_closed",
        }
      )
    }
    if (row.email !== user.email.trim().toLowerCase()) {
      throw new ForbiddenError("The invitation is for another email.", {
        code: "guest_email_mismatch",
      })
    }
    // Only the first acceptance wins, even under a double submit.
    const claimed = await db.projectGuest.updateMany({
      where: { id: row.id, status: "invited" },
      data: { status: "active", userId: user.id, acceptedAt: now() },
    })
    if (claimed.count === 0) {
      throw new ValidationError(
        "The invitation is no longer valid.",
        undefined,
        {
          code: "guest_invitation_closed",
        }
      )
    }
    const homes = await db.member.findMany({
      where: { userId: user.id, clientId: null },
      select: { organization: { select: { name: true } } },
    })
    await deps.audit(
      {
        organizationId: row.organizationId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      },
      {
        action: AUDIT_ACTIONS.projectGuestAccepted,
        entityType: "projectGuest",
        entityId: row.id,
        entityLabel: `${row.email} · ${row.projectName}`,
        after: {
          projectId: row.projectId,
          guestOrganizations: homes.map((home) => home.organization.name),
        },
      }
    )
    return row.id
  }

  async function leave(user: GuestUser, grantId: string): Promise<void> {
    const row = await db.projectGuest.findFirst({
      where: { id: grantId, userId: user.id, status: "active" },
    })
    if (!row) throw new NotFoundError("Guest")
    await db.projectGuest.update({
      where: { id: row.id },
      data: { status: "revoked", revokedAt: now() },
    })
    await deps.audit(
      {
        organizationId: row.organizationId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      },
      {
        action: AUDIT_ACTIONS.projectGuestLeft,
        entityType: "projectGuest",
        entityId: row.id,
        entityLabel: `${row.email} · ${row.projectName}`,
      }
    )
  }

  /** Every project this user can open as a guest right now. */
  async function listForUser(userId: string) {
    const at = now()
    const rows = await db.projectGuest.findMany({
      where: { userId, status: "active", expiresAt: { gt: at } },
      include: { organization: { select: { name: true } } },
      orderBy: { expiresAt: "asc" },
    })
    return rows.map((row) => ({
      id: row.id,
      projectName: row.projectName,
      organizationName: row.organization.name,
      expiresAt: row.expiresAt,
    }))
  }

  /**
   * The guest context for one request, or null. Checked on every request:
   * revoked, expired, someone else's or no-longer-entitled grants all fail.
   */
  async function resolve(
    user: GuestUser,
    grantId: string
  ): Promise<GuestContext | null> {
    const row = await db.projectGuest.findUnique({
      where: { id: grantId },
      include: { organization: { select: { name: true } } },
    })
    if (!row || !guestGrantUsable(row, user.id, now())) return null
    if ((await deps.guestLimit(row.organizationId)) <= 0) return null
    return {
      grantId: row.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      organizationId: row.organizationId,
      organizationName: row.organization.name,
      projectId: row.projectId,
      projectName: row.projectName,
      capabilities: parseGuestCapabilities(row.capabilities),
      expiresAt: row.expiresAt,
    }
  }

  return { invite, list, revoke, preview, accept, leave, listForUser, resolve }
}

export type GuestService = ReturnType<typeof createGuestService>
