/** Pure feedback figures shared by the service, the report and the trend. */

import {
  CLIENT_FEEDBACK_OPEN_STATUSES,
  type ClientFeedbackData,
  type ClientFeedbackSummaryData,
  type ClientReleaseGroupData,
} from "./types"

function countBy(items: ClientFeedbackData[], key: keyof ClientFeedbackData) {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const value = String(item[key])
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

/** Totals a report shows: by status, category and impact. */
export function summarizeFeedback(
  items: ClientFeedbackData[]
): ClientFeedbackSummaryData {
  const open = new Set<string>(CLIENT_FEEDBACK_OPEN_STATUSES)
  return {
    total: items.length,
    open: items.filter((item) => open.has(item.status)).length,
    byStatus: countBy(items, "status"),
    byCategory: countBy(items, "category"),
    byImpact: countBy(items, "impact"),
  }
}

export interface FeedbackTrendPoint {
  version: string
  open: number
  fixed: number
}

/** Open and fixed reports per version, oldest release first. */
export function feedbackTrend(
  groups: ClientReleaseGroupData[]
): FeedbackTrendPoint[] {
  const open = new Set<string>(CLIENT_FEEDBACK_OPEN_STATUSES)
  return groups
    .filter((group) => group.feedback.length > 0)
    .map((group) => ({
      version: group.release.version,
      sortKey: group.release.releasedAt ?? group.release.createdAt,
      open: group.feedback.filter((item) => open.has(item.status)).length,
      fixed: group.feedback.filter((item) => item.status === "fixed").length,
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ version, open, fixed }) => ({ version, open, fixed }))
}
