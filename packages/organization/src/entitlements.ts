import {
  entitlementsFor,
  hasEntitlement,
  type Entitlement,
  type Entitlements,
  type OrgPlan,
} from "@workspace/core/plans"
import { effectivePlan } from "@workspace/core/trial"
import { ForbiddenError } from "@workspace/core/errors"

export {
  entitlementsFor,
  hasEntitlement,
  type Entitlement,
  type Entitlements,
  type OrgPlan,
} from "@workspace/core/plans"

/** The organization fields plan resolution needs. */
export interface PlanSource {
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
}

/** The stored plan, supplied by the app's billing module. */
export type StoredPlanResolver = (organization: PlanSource) => OrgPlan

export interface OrganizationEntitlementDb {
  organization: {
    findUnique(args: {
      where: { id: string }
      select: {
        metadata: true
        trialEndsAt: true
        subscription: { select: { plan: true } }
      }
    }): PromiseLike<PlanSource | null>
  }
  member: {
    count(args: {
      where: { organizationId: string; clientId: null }
    }): PromiseLike<number>
  }
  invitation: {
    count(args: { where: Record<string, unknown> }): PromiseLike<number>
  }
}

/**
 * The plan actually enforced. A paid subscription (Stripe or a manual
 * Enterprise grant) wins over `metadata.plan`; either way a free organization
 * is upgraded to Team while its trial window is open.
 */
export function resolvePlanWith(
  planForOrganization: StoredPlanResolver,
  organization: PlanSource,
  now = new Date()
): OrgPlan {
  const stored = planForOrganization(organization)
  return effectivePlan(stored, { trialEndsAt: organization.trialEndsAt }, now)
}

export function upgradeRequired(entitlement: Entitlement) {
  return new ForbiddenError("This feature requires a higher plan.", {
    code: "upgrade_required",
    params: { entitlement },
  })
}

/** Pending invitations hold a seat so an org cannot over-invite past its plan. */
export function seatLimitReached(
  seats: number,
  members: number,
  pendingInvitations: number
): boolean {
  return members + pendingInvitations >= seats
}

/** Build the DB-backed entitlement helpers for the identity database. */
export function createOrganizationEntitlements({
  db,
  planForOrganization,
}: {
  db: OrganizationEntitlementDb
  planForOrganization: StoredPlanResolver
}) {
  function resolvePlan(organization: PlanSource, now = new Date()): OrgPlan {
    return resolvePlanWith(planForOrganization, organization, now)
  }

  async function getOrganizationPlan(organizationId: string): Promise<OrgPlan> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        metadata: true,
        trialEndsAt: true,
        subscription: { select: { plan: true } },
      },
    })
    if (!organization) return "free"
    return resolvePlan({
      metadata: organization.metadata,
      trialEndsAt: organization.trialEndsAt,
      subscription: organization.subscription ?? null,
    })
  }

  async function getOrganizationEntitlements(
    organizationId: string
  ): Promise<Entitlements> {
    return entitlementsFor(await getOrganizationPlan(organizationId))
  }

  async function can(
    organizationId: string,
    entitlement: Entitlement
  ): Promise<boolean> {
    return hasEntitlement(
      await getOrganizationEntitlements(organizationId),
      entitlement
    )
  }

  /** Server-side gate: throws a typed `upgrade_required` error when the plan lacks it. */
  async function requireEntitlement(
    organizationId: string,
    entitlement: Entitlement
  ): Promise<void> {
    if (!(await can(organizationId, entitlement))) {
      throw upgradeRequired(entitlement)
    }
  }

  /**
   * Whether the organization has used every seat of its plan. Client-portal
   * accounts never take a seat. Pass `countPending` when creating an invitation.
   */
  async function seatsFull(
    organizationId: string,
    { countPending }: { countPending: boolean }
  ): Promise<{ full: boolean; seats: number }> {
    const { seats } = await getOrganizationEntitlements(organizationId)
    if (seats === Infinity) return { full: false, seats }
    const [members, pending] = await Promise.all([
      db.member.count({ where: { organizationId, clientId: null } }),
      countPending
        ? db.invitation.count({
            where: {
              organizationId,
              status: "pending",
              expiresAt: { gt: new Date() },
              NOT: { role: "client" },
            },
          })
        : 0,
    ])
    return { full: seatLimitReached(seats, members, pending), seats }
  }

  return {
    resolvePlan,
    getOrganizationPlan,
    getOrganizationEntitlements,
    can,
    requireEntitlement,
    seatsFull,
  }
}
