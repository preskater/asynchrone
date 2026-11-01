import { createOrganizationEntitlements } from "@workspace/organization/entitlements"

import { planForOrganization } from "@/lib/billing/plans"
import { prisma } from "@/lib/prisma"

/**
 * App-side wiring for the shared organization plan checks: the package owns
 * the rules, this module binds them to Copilot's billing plan reader and
 * identity database.
 */
const entitlements = createOrganizationEntitlements({
  db: prisma,
  planForOrganization,
})

export const {
  resolvePlan,
  getOrganizationPlan,
  getOrganizationEntitlements,
  can,
  requireEntitlement,
  seatsFull,
} = entitlements

export {
  entitlementsFor,
  hasEntitlement,
  seatLimitReached,
  upgradeRequired,
  type Entitlement,
  type Entitlements,
  type OrgPlan,
  type PlanSource,
} from "@workspace/organization/entitlements"
