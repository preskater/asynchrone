/**
 * Plan → entitlements, the single source of truth for what each plan includes.
 *
 * Dependency-free (no database client) so every app — including the control
 * tower, which owns a different database — can resolve the same plans.
 */
export type OrgPlan = "free" | "team" | "enterprise"

export const ORG_PLANS: OrgPlan[] = ["free", "team", "enterprise"]

export type Entitlement =
  | "seats"
  | "storageBytes"
  | "aiBudgetMicrosPerSeat"
  | "auditLog"
  | "sso"
  | "scim"
  | "granularPermissions"
  | "apiAccess"
  | "requireTwoFactor"

export type Entitlements = {
  seats: number
  storageBytes: number
  /** Monthly AI spend allowed per workspace seat, in micro-USD (0 = no AI). */
  aiBudgetMicrosPerSeat: number
  auditLog: boolean
  sso: boolean
  scim: boolean
  granularPermissions: boolean
  apiAccess: boolean
  /** Owners and admins may make two-factor authentication mandatory. */
  requireTwoFactor: boolean
}

const GB = 1024 * 1024 * 1024
// $8 of AI spend per seat/month. Team lists at $12 monthly / $10 yearly, so a
// seat keeps a 33% / 20% gross margin before infrastructure. Keep this below
// the yearly price in `apps/landing/lib/landing/content.ts` and `pricing.json`.
const AI_BUDGET_PER_SEAT = 8_000_000

const ENTITLEMENTS: Record<OrgPlan, Entitlements> = {
  free: {
    seats: 5,
    storageBytes: 1 * GB,
    aiBudgetMicrosPerSeat: 0,
    auditLog: false,
    sso: false,
    scim: false,
    granularPermissions: false,
    apiAccess: true,
    requireTwoFactor: false,
  },
  team: {
    // Mirrors the "Up to 100 members" the pricing page sells.
    seats: 100,
    storageBytes: 100 * GB,
    aiBudgetMicrosPerSeat: AI_BUDGET_PER_SEAT,
    auditLog: false,
    sso: false,
    scim: false,
    granularPermissions: true,
    apiAccess: true,
    requireTwoFactor: true,
  },
  enterprise: {
    seats: Infinity,
    storageBytes: 1024 * GB,
    aiBudgetMicrosPerSeat: AI_BUDGET_PER_SEAT,
    auditLog: true,
    sso: true,
    scim: true,
    granularPermissions: true,
    apiAccess: true,
    requireTwoFactor: true,
  },
}

export function entitlementsFor(plan: OrgPlan): Entitlements {
  return ENTITLEMENTS[plan]
}

/** Numeric limits count as enabled when above zero. */
export function hasEntitlement(
  entitlements: Entitlements,
  entitlement: Entitlement
): boolean {
  return Boolean(entitlements[entitlement])
}

/** Reads `plan` from organization metadata; anything missing or unknown is `free`. */
export function parsePlan(metadata: string | null | undefined): OrgPlan {
  if (!metadata) return "free"
  try {
    const parsed = JSON.parse(metadata) as { plan?: unknown }
    if (ORG_PLANS.includes(parsed.plan as OrgPlan)) {
      return parsed.plan as OrgPlan
    }
  } catch {
    // Organization metadata also holds appearance settings; ignore bad JSON.
  }
  return "free"
}

/** AI allowances reset on the first day of each month, UTC. */
export function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const resetAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  )
  return { start, resetAt }
}
