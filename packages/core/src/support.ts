/**
 * Support policy (#101): the one source of truth for channels, severities and
 * first-response targets. The landing's /support page, Copilot's help center
 * and the control-tower ticket queue all render from this table, so the
 * published policy cannot drift from what the team works against.
 *
 * Targets are first responses in business hours (Mon–Fri 09:00–18:00
 * Europe/Paris, French public holidays excluded), not resolution times.
 */
import type { OrgPlan } from "./plans"

export const SUPPORT_SEVERITIES = ["sev1", "sev2", "sev3"] as const
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number]

export const SUPPORT_HOURS = {
  timezone: "Europe/Paris",
  days: "Mon–Fri",
  open: "09:00",
  close: "18:00",
} as const

export const SUPPORT_EMAIL = "support@asynchrone.space"

/** Channels per plan; labels live in `Support.channels.<key>`. */
export const SUPPORT_CHANNELS: Record<OrgPlan, readonly string[]> = {
  free: ["inApp", "email", "community"],
  team: ["inApp", "email"],
  enterprise: ["inApp", "email", "namedContact"],
}

/**
 * First-response target in business hours, or `null` for best effort. Kept as
 * numbers so the control tower can show the target next to a ticket.
 */
export const SUPPORT_RESPONSE_HOURS: Record<
  OrgPlan,
  Record<SupportSeverity, number | null>
> = {
  free: { sev1: null, sev2: null, sev3: null },
  team: { sev1: 4, sev2: 9, sev3: 18 },
  enterprise: { sev1: 2, sev2: 4, sev3: 9 },
}

/** The ticket form asks for impact; this is how triage starts from it. */
export function severityForImpact(impact: string): SupportSeverity {
  if (impact === "critical") return "sev1"
  if (impact === "high") return "sev2"
  return "sev3"
}

/** First-response target for a ticket, `null` when best effort. */
export function responseTargetHours(
  plan: string,
  impact: string
): number | null {
  const targets = SUPPORT_RESPONSE_HOURS[plan as OrgPlan]
  return targets ? targets[severityForImpact(impact)] : null
}
