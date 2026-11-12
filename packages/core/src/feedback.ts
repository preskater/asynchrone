/**
 * Feedback vocabulary shared by the in-app feedback form (Copilot) and client
 * test feedback (clients app, ADR 0040).
 */

/** What the tester is reporting. */
export const FEEDBACK_CATEGORIES = [
  "bug",
  "idea",
  "design",
  "performance",
  "other",
] as const
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]

/** How much the report affects the tester's work. */
export const FEEDBACK_IMPACTS = ["low", "medium", "high", "critical"] as const
export type FeedbackImpact = (typeof FEEDBACK_IMPACTS)[number]
