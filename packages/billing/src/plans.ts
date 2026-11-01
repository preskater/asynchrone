/** Plan catalog and status mapping shared by the billing UI and services. */

import { ORG_PLANS, parsePlan, type OrgPlan } from "@workspace/db/plans"

import type { BillingInterval, SubscriptionStatus } from "./types"

/** Narrow an unknown string to a known plan, defaulting to Starter. */
export function normalizePlan(value: string | null | undefined): OrgPlan {
  return ORG_PLANS.includes(value as OrgPlan) ? (value as OrgPlan) : "free"
}

/**
 * Stored plan: the subscription row wins over `metadata.plan`, which remains
 * the field the control tower and the trial write.
 */
export function planForOrganization(organization: {
  metadata: string | null
  subscription: { plan: string } | null
}): OrgPlan {
  if (organization.subscription) {
    return normalizePlan(organization.subscription.plan)
  }
  return parsePlan(organization.metadata)
}

export const PAID_PLAN: OrgPlan = "team"

/**
 * Team pricing in the smallest currency unit. Yearly is 10 × months, matching
 * the "€12 monthly / €10 billed yearly" copy on the pricing page. The client
 * renders these through `BillingOverviewData.prices`, so this is the only place
 * the amount is written down.
 */
export const TEAM_PRICE: Record<
  BillingInterval,
  { amount: number; currency: string }
> = {
  month: { amount: 1200, currency: "eur" },
  year: { amount: 12000, currency: "eur" },
}

const PROVIDER_STATUS_ALIASES: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "inactive",
  incomplete_expired: "canceled",
  paused: "inactive",
}

/** Unknown provider statuses are treated as inactive rather than paid. */
export function normalizeStatus(
  raw: string | null | undefined
): SubscriptionStatus {
  if (!raw) return "inactive"
  return PROVIDER_STATUS_ALIASES[raw] ?? "inactive"
}

/**
 * The plan a status entitles the organization to. `past_due` keeps Team while
 * the provider retries the payment; losing the plan is what would delete the
 * customer's access to their own data.
 */
export function planForStatus(status: SubscriptionStatus): OrgPlan {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return PAID_PLAN
    default:
      return "free"
  }
}

export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === "team" || plan === "enterprise"
}
