/** Shared types and limits for the in-app feedback form. */

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

/** How often a bug or slowdown happens. */
export const FEEDBACK_FREQUENCIES = [
  "always",
  "often",
  "sometimes",
  "once",
  "unknown",
] as const
export type FeedbackFrequency = (typeof FEEDBACK_FREQUENCIES)[number]

/** Free-text questions a category can ask in addition to the common fields. */
export const FEEDBACK_TEXT_FIELDS = [
  "steps",
  "expected",
  "problem",
  "benefit",
  "suggestion",
] as const
export type FeedbackTextField = (typeof FEEDBACK_TEXT_FIELDS)[number]

export type FeedbackFieldId = FeedbackTextField | "frequency"

/**
 * Extra questions per category, in display order. The common fields (summary,
 * details, page, contact, screenshot) are always shown; these adapt the form
 * to what the tester is reporting.
 */
export const FEEDBACK_FIELDS_BY_CATEGORY = {
  bug: ["frequency", "steps", "expected"],
  idea: ["problem", "benefit"],
  design: ["problem", "suggestion"],
  performance: ["frequency", "steps", "expected"],
  other: [],
} as const satisfies Record<FeedbackCategory, readonly FeedbackFieldId[]>

/**
 * One optional screenshot, sent as an email attachment. The base64 payload
 * travels through a server action, so the cap stays modest (and the action
 * body limit in `next.config.ts` leaves headroom for JSON overhead).
 */
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const FEEDBACK_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const
export type FeedbackAttachmentType = (typeof FEEDBACK_ATTACHMENT_TYPES)[number]

/** Base64 expands the payload by 4/3; pad for the trailing "=" characters. */
export const MAX_FEEDBACK_ATTACHMENT_BASE64_LENGTH =
  Math.ceil((MAX_FEEDBACK_ATTACHMENT_BYTES * 4) / 3) + 4

/** Anti-spam: at most five reports per user per ten minutes, per instance. */
export const FEEDBACK_RATE_LIMIT = 5
export const FEEDBACK_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000

/** Browser/account details captured alongside the report. */
export interface FeedbackContext {
  locale: string
  timezone: string
  viewport: string
  userAgent: string
}

export interface FeedbackAttachment {
  filename: string
  contentType: FeedbackAttachmentType
  /** Base64 content, without the `data:` URL prefix. */
  data: string
}

export interface SubmitFeedbackInput {
  category: FeedbackCategory
  impact: FeedbackImpact
  title: string
  description: string
  /** Only meaningful for bug/performance; normalized away otherwise. */
  frequency: FeedbackFrequency
  steps: string
  expected: string
  problem: string
  benefit: string
  suggestion: string
  /** The page the tester was on, pre-filled from the current route. */
  page?: string
  contactEmail: string
  allowContact: boolean
  context: FeedbackContext
  attachment?: FeedbackAttachment
}

export interface FeedbackSubmissionResult {
  /**
   * False when transactional email is not configured (local development or a
   * preview). The report is still logged server-side; the UI tells the user.
   */
  delivered: boolean
}
