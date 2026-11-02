import {
  entitlementsFor,
  type Entitlements as DbEntitlements,
} from "@workspace/core/plans"
import { effectivePlan } from "@workspace/core/trial"
import { prisma } from "@workspace/db-identity"
import type {
  AddWorkspaceMember,
  Entitlements,
  IdentityUser,
  IntegrationToken,
  Member,
  Organization,
  PortalAccess,
  UpdateWorkspaceMember,
  Workspace,
} from "@workspace/contracts"

import { planForOrganization } from "@/lib/billing/plans"
import { getOrganizationShell } from "@/lib/organization/shell"
import { parseRoles } from "@workspace/organization/utils"

/**
 * Read model for the identity internal API. Backed by the identity database so
 * the endpoint keeps working after the #185 cutover; tests inject a fake.
 */
export interface IdentityRepository {
  getOrganization(id: string): Promise<Organization | null>
  listMembers(organizationId: string): Promise<Member[]>
  getUser(id: string): Promise<IdentityUser | null>
  getEntitlements(organizationId: string): Promise<Entitlements | null>
  /** One read for a domain app's workspace gate. */
  getWorkspace(sessionId: string, organizationId: string): Promise<Workspace | null>
  addMember(
    organizationId: string,
    input: AddWorkspaceMember
  ): Promise<Member>
  updateMemberRole(
    organizationId: string,
    userId: string,
    input: UpdateWorkspaceMember
  ): Promise<Member>
  removeMember(organizationId: string, userId: string): Promise<{ id: string }>
  getPortalAccess(
    organizationId: string,
    clientId: string
  ): Promise<PortalAccess>
  listPresence(
    organizationId: string
  ): Promise<{ userId: string; lastSeenAt: Date | null }[]>
  getAppearance(
    organizationId: string
  ): Promise<{ metadata: string | null } | null>
  getIntegrationToken(
    userId: string,
    provider: string
  ): Promise<IntegrationToken>
  touchPresence(userId: string): Promise<{ at: Date }>
}

function role(value: string | null): Member["role"] {
  return parseRoles(value)[0] ?? "member"
}

function mapEntitlements(
  plan: ReturnType<typeof resolvePlan>,
  entitlements: DbEntitlements
): Entitlements {
  return {
    plan,
    seats: entitlements.seats === Infinity ? null : entitlements.seats,
    storageBytes: entitlements.storageBytes,
    aiBudgetMicrosPerSeat: entitlements.aiBudgetMicrosPerSeat,
    auditLog: entitlements.auditLog,
    sso: entitlements.sso,
    requireTwoFactor: entitlements.requireTwoFactor,
    granularPermissions: entitlements.granularPermissions,
    apiAccess: entitlements.apiAccess,
    scim: entitlements.scim,
  }
}

function resolvePlan(organization: {
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
}) {
  return effectivePlan(
    planForOrganization(organization),
    { trialEndsAt: organization.trialEndsAt },
    new Date()
  )
}

export const identityRepository: IdentityRepository = {
  async getOrganization(id) {
    return prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true },
    })
  },

  async listMembers(organizationId) {
    const members = await prisma.member.findMany({
      where: { organizationId },
      select: {
        role: true,
        clientId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { user: { name: "asc" } },
    })
    return members.map((member) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.image,
      role: role(member.role),
      clientId: member.clientId,
      createdAt: member.createdAt,
    }))
  },

  async getUser(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, image: true },
    })
    return user ? { ...user, avatarUrl: user.image } : null
  },

  async getEntitlements(organizationId) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        metadata: true,
        trialEndsAt: true,
        subscription: { select: { plan: true } },
      },
    })
    if (!organization) return null
    const plan = resolvePlan({
      metadata: organization.metadata,
      trialEndsAt: organization.trialEndsAt,
      subscription: organization.subscription ?? null,
    })
    return mapEntitlements(plan, entitlementsFor(plan))
  },

  async getWorkspace(sessionId, organizationId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        createdAt: true,
        impersonatedBy: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            customerTwoFactorEnabled: true,
          },
        },
      },
    })
    if (!session) return null

    const [organization, member, memberships, shell] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          metadata: true,
          trialEndsAt: true,
          subscription: { select: { plan: true } },
        },
      }),
      prisma.member.findFirst({
        where: { organizationId, userId: session.userId },
        select: { role: true, clientId: true, createdAt: true },
      }),
      prisma.member.findMany({
        where: { userId: session.userId, clientId: null },
        select: {
          role: true,
          clientId: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { organization: { name: "asc" } },
      }),
      getOrganizationShell(organizationId),
    ])
    if (!organization || !member || !shell) return null

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
        twoFactorEnabled: Boolean(session.user.customerTwoFactorEnabled),
      },
      session: {
        id: session.id,
        impersonatedBy: session.impersonatedBy,
        createdAt: session.createdAt,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      member: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        avatarUrl: session.user.image,
        role: role(member.role),
        clientId: member.clientId,
        createdAt: member.createdAt,
      },
      organizations: memberships.map((membership) => ({
        ...membership.organization,
        role: role(membership.role),
        clientId: membership.clientId,
      })),
      entitlements: mapEntitlements(
        resolvePlan({
          metadata: organization.metadata,
          trialEndsAt: organization.trialEndsAt,
          subscription: organization.subscription ?? null,
        }),
        shell.entitlements
      ),
      requireTwoFactor: shell.requireTwoFactor,
      storageQuotaBytes: shell.storageQuotaBytes,
      deletionScheduledAt: shell.deletionScheduledAt,
      metadata: organization.metadata,
    }
  },

  async addMember(organizationId, input) {
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: {},
      create: {
        id: `user_${crypto.randomUUID()}`,
        name: input.name,
        email: input.email,
        emailVerified: false,
      },
    })
    const member = await prisma.member.create({
      data: {
        id: `member_${crypto.randomUUID()}`,
        organizationId,
        userId: user.id,
        role: input.role,
        createdAt: new Date(),
      },
      select: { role: true, clientId: true, createdAt: true },
    })
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.image,
      role: role(member.role),
      clientId: member.clientId,
      createdAt: member.createdAt,
    }
  },

  async updateMemberRole(organizationId, userId, input) {
    const member = await prisma.member.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role: input.role },
      select: {
        role: true,
        clientId: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })
    return {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.image,
      role: role(member.role),
      clientId: member.clientId,
      createdAt: member.createdAt,
    }
  },

  async removeMember(organizationId, userId) {
    await prisma.member.delete({
      where: { organizationId_userId: { organizationId, userId } },
    })
    return { id: userId }
  },

  async getPortalAccess(organizationId, clientId) {
    const [members, invites] = await Promise.all([
      prisma.member.findMany({
        where: { organizationId, clientId },
        select: {
          id: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.portalInvite.findMany({
        where: { organizationId, clientId, acceptedAt: null },
        orderBy: { createdAt: "desc" },
      }),
    ])
    return {
      members: members.map((member) => ({
        memberId: member.id,
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        createdAt: member.createdAt.toISOString(),
      })),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        name: invite.name ?? undefined,
        createdAt: invite.createdAt.toISOString(),
        invitationId: invite.invitationId ?? undefined,
      })),
    }
  },

  async listPresence(organizationId) {
    const members = await prisma.member.findMany({
      where: { organizationId, clientId: null },
      select: { userId: true, user: { select: { lastSeenAt: true } } },
    })
    return members.map((member) => ({
      userId: member.userId,
      lastSeenAt: member.user.lastSeenAt,
    }))
  },

  async getAppearance(organizationId) {
    return prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    })
  },

  async getIntegrationToken(userId, provider) {
    const account = await prisma.account.findFirst({
      where: { userId, providerId: provider, accessToken: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { accessToken: true },
    })
    return { accessToken: account?.accessToken ?? null }
  },

  async touchPresence(userId) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
      select: { lastSeenAt: true },
    })
    return { at: user.lastSeenAt ?? new Date() }
  },
}
