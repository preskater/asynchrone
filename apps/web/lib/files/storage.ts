import { entitlementsFor } from "@workspace/core/plans"

import { resolvePlan } from "@/lib/organization/entitlements"
import { prisma } from "@/lib/prisma"

export async function orgQuotaBytes(organizationId: string): Promise<number> {
  const organization = await prisma.organization.findUnique({
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

export async function orgUsedBytes(organizationId: string): Promise<number> {
  const result = await prisma.fileNode.aggregate({
    where: { organizationId, trashed: false },
    _sum: { sizeBytes: true },
  })
  return result._sum.sizeBytes ?? 0
}
