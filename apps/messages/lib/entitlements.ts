import { createOrganizationEntitlements } from "@workspace/organization/entitlements"

import { planForOrganization } from "@workspace/billing/plans"
import { prisma } from "@/lib/prisma"

/**
 * Plan checks for the messages app.
 *
 * Attachments reuse the files upload service, which asks for the storage
 * quota entitlement; every check reads the plan through the shared resolver
 * (`resolvePlan` in `@workspace/organization`). Until #190 the app reads the
 * identity tables through the shared client (see `lib/prisma.ts`).
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
  upgradeRequired,
  type Entitlement,
  type Entitlements,
  type OrgPlan,
  type PlanSource,
} from "@workspace/organization/entitlements"
