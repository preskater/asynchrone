import {
  entitlementsFor,
  type Entitlements as DbEntitlements,
} from "@workspace/core/plans"
import { effectivePlan } from "@workspace/core/trial"
import { prisma } from "@workspace/db-identity"
import type {
  Entitlements,
  IdentityUser,
  Member,
  Organization,
} from "@workspace/contracts"

import { planForOrganization } from "@/lib/billing/plans"
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
}
