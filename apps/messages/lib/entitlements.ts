import { hasEntitlement, upgradeRequired, type Entitlement } from "@workspace/organization/entitlements"

import { identity } from "@/lib/identity"

/**
 * The files app's plan checks. Copilot resolves the plan and returns the
 * enforced entitlements; this app owns no billing row.
 */
export async function requireEntitlement(
  organizationId: string,
  entitlement: Entitlement
): Promise<void> {
  const entitlements = await identity.getEntitlements(organizationId)
  if (!hasEntitlement(entitlements as never, entitlement)) {
    throw upgradeRequired(entitlement)
  }
}

export async function storageQuotaBytes(
  organizationId: string
): Promise<number> {
  const entitlements = await identity.getEntitlements(organizationId)
  return entitlements.storageBytes
}

export {
  entitlementsFor,
  hasEntitlement,
  upgradeRequired,
  type Entitlement,
  type Entitlements,
  type OrgPlan,
  type PlanSource,
} from "@workspace/organization/entitlements"
