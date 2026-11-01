/**
 * Team trial rules, kept free of I/O so every app can resolve the same plan
 * and the rules can be unit tested.
 *
 * The trial never rewrites `metadata.plan`: a free organization is treated as
 * Team while `trialEndsAt` is in the future, so the downgrade happens on time
 * even if the expiry cron is late, and no data is ever touched.
 */
import type { OrgPlan } from "./plans"

export const TRIAL_DAYS = 14
export const TRIAL_REMINDER_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export interface TrialFields {
  trialStartedAt: Date | null
  trialEndsAt: Date | null
  trialReminderSentAt: Date | null
  trialEndedAt: Date | null
}

export function trialEndsAtFrom(now: Date): Date {
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS)
}

export function isTrialActive(
  org: Pick<TrialFields, "trialEndsAt">,
  now = new Date()
): boolean {
  // `!= null` also covers fields a partial `select` did not load.
  return org.trialEndsAt != null && org.trialEndsAt > now
}

export function trialDaysLeft(
  org: Pick<TrialFields, "trialEndsAt">,
  now = new Date()
): number {
  const endsAt = org.trialEndsAt
  if (endsAt == null || !isTrialActive(org, now)) return 0
  return Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS)
}

/** The plan to enforce: the trial only ever upgrades a free organization. */
export function effectivePlan(
  plan: OrgPlan,
  org: Pick<TrialFields, "trialEndsAt">,
  now = new Date()
): OrgPlan {
  if (plan === "free" && isTrialActive(org, now)) return "team"
  return plan
}

export type TrialStage = "remind" | "expire"

/**
 * What the expiry cron still owes this organization. Expiry wins over the
 * reminder, so a cron that was down for days does not send a stale D-3 email.
 */
export function trialStage(
  org: TrialFields,
  now = new Date()
): TrialStage | null {
  if (!org.trialEndsAt || org.trialEndedAt) return null
  if (org.trialEndsAt <= now) return "expire"
  if (
    !org.trialReminderSentAt &&
    org.trialEndsAt.getTime() - now.getTime() <= TRIAL_REMINDER_DAYS * DAY_MS
  ) {
    return "remind"
  }
  return null
}

// Blocking these domains would block every user of the provider.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.fr",
  "orange.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "wanadoo.fr",
])

/** The keys a trial claim is recorded and checked under. */
export function trialClaimKeys(email: string): {
  email: string
  domain: string | null
} {
  const normalized = email.trim().toLowerCase()
  const domain = normalized.split("@")[1] ?? ""
  return {
    email: normalized,
    domain: domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : null,
  }
}

export type TrialRefusal =
  | "trial_not_eligible"
  | "trial_already_used"
  | "trial_email_unverified"
  | "trial_already_claimed"

export function trialRefusal(input: {
  plan: OrgPlan
  org: Pick<TrialFields, "trialStartedAt">
  emailVerified: boolean
  /** A previous claim matched the email or the (non-public) domain. */
  claimed: boolean
}): TrialRefusal | null {
  if (input.plan !== "free") return "trial_not_eligible"
  if (input.org.trialStartedAt) return "trial_already_used"
  if (!input.emailVerified) return "trial_email_unverified"
  if (input.claimed) return "trial_already_claimed"
  return null
}
