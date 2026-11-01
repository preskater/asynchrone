import { parsePlan, type OrgPlan } from "@workspace/core/plans"
import { effectivePlan } from "@workspace/core/trial"

/**
 * How long each plan keeps audit rows. The cleanup job prunes everything older
 * than its organization's window, so the table cannot grow without bound even
 * on plans where the audit page itself is not included.
 *
 * `free` is the Starter plan sold on the pricing page, `team` is the 12-month
 * window the Enterprise comparison implies, and `enterprise` is a default that
 * a workspace can override (see {@link AUDIT_RETENTION_MAX_DAYS}).
 */
export const AUDIT_RETENTION_DAYS: Record<OrgPlan, number> = {
  free: 30,
  team: 365,
  enterprise: 730,
}

/** Floors: compliance asks for a meaningful window, not "one day". */
export const AUDIT_RETENTION_MIN_DAYS = 30
/** Ceiling: ten years, so a typo cannot disable pruning for a decade-plus. */
export const AUDIT_RETENTION_MAX_DAYS = 3_650

/** `metadata.auditRetentionDays`, clamped; `null` when absent or unusable. */
export function parseRetentionOverride(
  metadata: string | null | undefined
): number | null {
  if (!metadata) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(metadata)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  return normalizeRetentionDays(
    (parsed as { auditRetentionDays?: unknown }).auditRetentionDays
  )
}

/** Rounds and clamps an untrusted retention value, or returns `null`. */
export function normalizeRetentionDays(value: unknown): number | null {
  const days =
    typeof value === "string" && value.trim() !== "" ? Number(value) : value
  if (typeof days !== "number" || !Number.isFinite(days)) return null
  return Math.min(
    AUDIT_RETENTION_MAX_DAYS,
    Math.max(AUDIT_RETENTION_MIN_DAYS, Math.round(days))
  )
}

export interface AuditRetention {
  plan: OrgPlan
  /** Days actually enforced for this organization. */
  days: number
  /** The Enterprise override, when one is set. */
  overrideDays: number | null
  canConfigure: boolean
}

export interface RetentionPlanSource {
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
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
    const plan = organization.subscription.plan
    return (["free", "team", "enterprise"] as const).includes(plan as OrgPlan)
      ? (plan as OrgPlan)
      : "free"
  }
  return parsePlan(organization.metadata)
}

/**
 * The retention window enforced for one organization. A trial counts as Team,
 * and only Enterprise may override the plan default.
 */
export function resolveAuditRetention(
  organization: RetentionPlanSource,
  now = new Date()
): AuditRetention {
  const plan = effectivePlan(
    planForOrganization(organization),
    { trialEndsAt: organization.trialEndsAt },
    now
  )
  const canConfigure = plan === "enterprise"
  const overrideDays = canConfigure
    ? parseRetentionOverride(organization.metadata)
    : null
  return {
    plan,
    days: overrideDays ?? AUDIT_RETENTION_DAYS[plan],
    overrideDays,
    canConfigure,
  }
}

/** Oldest `createdAt` still kept for a retention window. */
export function auditRetentionCutoff(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}
