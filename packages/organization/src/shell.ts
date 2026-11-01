import {
  entitlementsFor,
  resolvePlanWith,
  type Entitlements,
  type PlanSource,
  type StoredPlanResolver,
} from "./entitlements"

/** The organization state the authenticated shell needs on every render. */
export interface OrganizationShell {
  /** Enforced plan entitlements (subscription, then `metadata.plan`, then trial). */
  entitlements: Entitlements
  /** Per-organization quota override, or the plan's storage limit. */
  storageQuotaBytes: number
  /** Set while the organization is scheduled for deletion. */
  deletionScheduledAt: Date | null
  /** Stored two-factor policy; the plan decides whether it is enforced. */
  requireTwoFactor: boolean
}

export interface OrganizationShellDb {
  organization: {
    findUnique(args: {
      where: { id: string }
      select: {
        metadata: true
        trialEndsAt: true
        storageQuotaBytes: true
        deletionScheduledAt: true
        requireTwoFactor: true
        subscription: { select: { plan: true } }
      }
    }): PromiseLike<
      | (PlanSource & {
          storageQuotaBytes: bigint | null
          deletionScheduledAt: Date | null
          requireTwoFactor: boolean
        })
      | null
    >
  }
}

/** Build the one-read shell query over the identity database. */
export function createOrganizationShell({
  db,
  planForOrganization,
}: {
  db: OrganizationShellDb
  planForOrganization: StoredPlanResolver
}) {
  async function getOrganizationShell(
    organizationId: string
  ): Promise<OrganizationShell | null> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        metadata: true,
        trialEndsAt: true,
        storageQuotaBytes: true,
        deletionScheduledAt: true,
        requireTwoFactor: true,
        subscription: { select: { plan: true } },
      },
    })
    if (!organization) return null

    const entitlements = entitlementsFor(
      resolvePlanWith(
        planForOrganization,
        {
          metadata: organization.metadata,
          trialEndsAt: organization.trialEndsAt,
          subscription: organization.subscription ?? null,
        },
        new Date()
      )
    )

    return {
      entitlements,
      // A per-organization override set from the control tower wins over the plan.
      storageQuotaBytes:
        organization.storageQuotaBytes !== null
          ? Number(organization.storageQuotaBytes)
          : entitlements.storageBytes,
      deletionScheduledAt: organization.deletionScheduledAt,
      requireTwoFactor: organization.requireTwoFactor,
    }
  }

  return { getOrganizationShell }
}
