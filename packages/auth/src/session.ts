import { headers } from "next/headers"

import type { MemberRole } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, UnauthorizedError } from "@workspace/core/errors"

/** Resolved identity of a signed-in client-portal user. */
export interface PortalContext {
  userId: string
  userName: string
  userEmail: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  clientId: string
  clientName: string
}

export interface AuthSessionUser {
  id: string
  name: string
  email: string
}

export interface AuthSession {
  user: AuthSessionUser
  session: {
    id: string
    activeOrganizationId?: string | null
  }
}

/** The subset of the Better Auth server the session helpers need. */
export interface AuthServer {
  api: {
    getSession(args: { headers: Headers }): Promise<AuthSession | null>
  }
}

export interface AuthSessionMember {
  role: string | null
  clientId: string | null
}

export interface AuthSessionPortalMember {
  organizationId: string
  clientId: string | null
  organization: { id: string; name: string; slug: string }
  client: { id: string; name: string } | null
}

export interface AuthSessionDb {
  member: {
    findFirst(args: {
      where: { organizationId: string; userId: string }
      select: { role: true; clientId: true }
    }): PromiseLike<any | null>
    findMany(args: {
      where: { userId: string; clientId?: { not: null } }
      include?: {
        organization: { select: { id: true; name: true; slug: true } }
        client: { select: { id: true; name: true } }
      }
    }): PromiseLike<any[]>
  }
}

const DEFAULT_ROLE: MemberRole = "member"

function firstRole(role: string | null | undefined): MemberRole {
  const primary = (role ?? "").split(",")[0]?.trim()
  switch (primary) {
    case "owner":
    case "admin":
    case "member":
    case "viewer":
    case "client":
      return primary
    default:
      return DEFAULT_ROLE
  }
}

export interface CreateAuthSessionOptions {
  auth: AuthServer
  db: AuthSessionDb
}

/**
 * Session helpers shared by the Copilot shell and, later, the domain apps.
 * The Better Auth instance and database are injected so the package never
 * imports an app or mounts a second auth server.
 */
export function createAuthSession({ auth, db }: CreateAuthSessionOptions) {
  async function contextForMember(
    user: AuthSessionUser,
    organizationId: string
  ): Promise<RequestContext> {
    const member = await db.member.findFirst({
      where: { organizationId, userId: user.id },
      select: { role: true, clientId: true },
    })

    if (!member) throw new ForbiddenError()
    // Client-portal members only ever act through the portal endpoints.
    if (member.clientId) {
      throw new ForbiddenError("Portal accounts cannot access the workspace.")
    }

    return {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      organizationId,
      role: firstRole(member.role),
    }
  }

  async function contextFromSession(): Promise<RequestContext | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null

    const organizationId = session.session.activeOrganizationId
    if (!organizationId) return null

    return contextForMember(session.user, organizationId)
  }

  async function getRequestContext(
    _options: { request?: Request; required?: boolean } = {}
  ): Promise<RequestContext> {
    // The web app and its API routes authenticate with the session cookie.
    // Machine-to-machine access goes through the OAuth2-protected MCP endpoint
    // (`app/mcp/route.ts`), which builds its own context from verified tokens.
    const ctx = await contextFromSession()
    if (ctx) return ctx

    throw new UnauthorizedError()
  }

  async function getOptionalRequestContext(): Promise<RequestContext | null> {
    try {
      return await contextFromSession()
    } catch {
      return null
    }
  }

  async function getRequestContextForOrganization(
    organizationId: string
  ): Promise<RequestContext> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) throw new UnauthorizedError()

    return contextForMember(session.user, organizationId)
  }

  function requirePermission(ctx: RequestContext, allowed: MemberRole[]) {
    if (allowed.includes(ctx.role)) return
    throw new ForbiddenError()
  }

  /** Members of the organization linked to a client company (portal users). */
  async function isPortalMember(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const member = await db.member.findFirst({
      where: { organizationId, userId },
      select: { role: true, clientId: true },
    })
    return Boolean(member?.clientId)
  }

  /**
   * Resolve the portal membership of the signed-in user: the member row linked
   * to a client company. When the user belongs to several organizations the
   * active one wins, otherwise the first membership.
   */
  async function getPortalContext(): Promise<PortalContext | null> {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) return null

    const activeOrganizationId =
      session.session.activeOrganizationId ?? undefined

    const members = await db.member.findMany({
      where: { userId: session.user.id, clientId: { not: null } },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        client: { select: { id: true, name: true } },
      },
    })

    const member =
      members.find((entry) => entry.organizationId === activeOrganizationId) ??
      members[0]

    if (!member?.client) return null

    return {
      userId: session.user.id,
      userName: session.user.name,
      userEmail: session.user.email,
      organizationId: member.organization.id,
      organizationName: member.organization.name,
      organizationSlug: member.organization.slug,
      clientId: member.client.id,
      clientName: member.client.name,
    }
  }

  return {
    contextForMember,
    getRequestContext,
    getOptionalRequestContext,
    getRequestContextForOrganization,
    requirePermission,
    isPortalMember,
    getPortalContext,
  }
}
