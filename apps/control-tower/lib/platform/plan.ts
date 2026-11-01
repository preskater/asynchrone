import { entitlementsFor, type OrgPlan } from "@workspace/core/plans"

/** Per-organization quota override wins over the plan's storage allowance. */
export function quotaBytes(
  plan: OrgPlan,
  storageQuotaBytes: string | null
): number {
  if (storageQuotaBytes !== null) return Number(storageQuotaBytes)
  return entitlementsFor(plan).storageBytes
}

export function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return 0
  return Math.min(100, Math.round((used / quota) * 100))
}

/** Trial state for the detail page: null unless a trial window is open. */
export function trialSummary(
  trialEndsAt: string | null,
  now = new Date()
): { daysLeft: number; endsAt: Date } | null {
  if (!trialEndsAt) return null
  const endsAt = new Date(trialEndsAt)
  if (Number.isNaN(endsAt.getTime()) || endsAt <= now) return null
  const daysLeft = Math.ceil(
    (endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  )
  return { daysLeft, endsAt }
}

/** AI allowance for one month at the organization's seat count. */
export function aiBudgetMicros(plan: OrgPlan, seats: number): number {
  return entitlementsFor(plan).aiBudgetMicrosPerSeat * seats
}
