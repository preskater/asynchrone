import { responseTargetHours, severityForImpact } from "@workspace/core/support"

/** "Sev 2 · 4 business h" — the policy target shown next to a ticket. */
export function ticketTarget(plan: string, impact: string): string {
  const hours = responseTargetHours(plan, impact)
  const severity = severityForImpact(impact).replace("sev", "Sev ")
  return `${severity} · ${hours === null ? "best effort" : `${hours} business h`}`
}

export const STATUS_VARIANT = {
  open: "destructive",
  acknowledged: "secondary",
  resolved: "outline",
} as const
