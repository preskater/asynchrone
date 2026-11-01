import { entitlementsFor } from "@workspace/core/plans"
import type { OrgPlan } from "@workspace/core/plans"
import type { PrismaClient } from "@workspace/db"

import type { FileQuota } from "./deps"

/** The organization fields plan resolution needs. */
export interface QuotaPlanSource {
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
}

export interface FileQuotaOptions {
  db: Pick<PrismaClient, "organization" | "fileNode">
  /**
   * The stored plan reader. Copilot binds `resolvePlan` from
   * `@/lib/organization/entitlements`; a domain app binds its own.
   */
  resolvePlan: (organization: QuotaPlanSource) => OrgPlan
}

/**
 * Quota and usage for the files app.
 *
 * `quotaBytes` prefers a per-organization override set from the control tower
 * and otherwise falls back to the plan's storage entitlement.
 */
export function createFileQuota({
  db,
  resolvePlan,
}: FileQuotaOptions): FileQuota {
  async function quotaBytes(organizationId: string): Promise<number> {
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
      select: {
        storageQuotaBytes: true,
        metadata: true,
        trialEndsAt: true,
        subscription: { select: { plan: true } },
      },
    })
    // A per-organization override set from the control tower wins over the plan.
    if (organization?.storageQuotaBytes != null) {
      return Number(organization.storageQuotaBytes)
    }
    if (!organization) return entitlementsFor("free").storageBytes
    return entitlementsFor(
      resolvePlan({
        metadata: organization.metadata,
        trialEndsAt: organization.trialEndsAt,
        subscription: organization.subscription ?? null,
      })
    ).storageBytes
  }

  async function usedBytes(organizationId: string): Promise<number> {
    const result = await db.fileNode.aggregate({
      where: { organizationId, trashed: false },
      _sum: { sizeBytes: true },
    })
    return result._sum.sizeBytes ?? 0
  }

  return { quotaBytes, usedBytes }
}
