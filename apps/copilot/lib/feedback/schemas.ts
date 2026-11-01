import { z } from "zod"

import {
  FEEDBACK_ATTACHMENT_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_FREQUENCIES,
  FEEDBACK_IMPACTS,
  MAX_FEEDBACK_ATTACHMENT_BASE64_LENGTH,
} from "./types"

export const feedbackAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(160),
  contentType: z.enum(FEEDBACK_ATTACHMENT_TYPES),
  data: z
    .string()
    .min(1)
    .max(MAX_FEEDBACK_ATTACHMENT_BASE64_LENGTH)
    // Reject anything that is not plain base64 (no data URL prefix, no URLs).
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
})

export const feedbackContextSchema = z.object({
  locale: z.string().trim().max(20).default("en"),
  timezone: z.string().trim().max(80).default(""),
  viewport: z.string().trim().max(40).default(""),
  userAgent: z.string().trim().max(500).default(""),
})

/**
 * The full report. Text limits are generous so a tester is never blocked by a
 * "too long" error, but small enough to keep the email readable.
 */
export const submitFeedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  impact: z.enum(FEEDBACK_IMPACTS),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
  frequency: z.enum(FEEDBACK_FREQUENCIES).default("unknown"),
  steps: z.string().trim().max(5000).optional().default(""),
  expected: z.string().trim().max(5000).optional().default(""),
  problem: z.string().trim().max(2000).optional().default(""),
  benefit: z.string().trim().max(2000).optional().default(""),
  suggestion: z.string().trim().max(2000).optional().default(""),
  page: z.string().trim().max(500).optional().default(""),
  contactEmail: z.email().max(200),
  allowContact: z.boolean().default(true),
  context: feedbackContextSchema.default({
    locale: "en",
    timezone: "",
    viewport: "",
    userAgent: "",
  }),
  attachment: feedbackAttachmentSchema.optional(),
})

export type SubmitFeedbackParsed = z.infer<typeof submitFeedbackSchema>
