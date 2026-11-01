import type { RequestContext } from "@workspace/core/context"
import { AppError, NotFoundError, ValidationError } from "@workspace/core/errors"
import { assertRateLimit } from "@/lib/core/rate-limit"
import { deliverEmail, type EmailDelivery } from "@/lib/email"
import { prisma } from "@/lib/prisma"

import {
  feedbackRecipients,
  feedbackSubject,
  renderFeedbackEmail,
} from "./email"
import type { SubmitFeedbackParsed } from "./schemas"
import {
  FEEDBACK_FIELDS_BY_CATEGORY,
  FEEDBACK_RATE_LIMIT,
  FEEDBACK_RATE_LIMIT_WINDOW_MS,
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  type FeedbackFieldId,
  type FeedbackSubmissionResult,
} from "./types"

/** Base64 decodes to a slightly smaller payload; `Buffer` is the exact check. */
function attachmentBytes(data: string) {
  return Buffer.byteLength(data, "base64")
}

/**
 * Drops answers that do not belong to the selected category. The form keeps
 * hidden answers in state while the tester switches categories, and the action
 * can be called directly, so the server is the source of truth here.
 */
function normalizeReport(input: SubmitFeedbackParsed): SubmitFeedbackParsed {
  const fields = new Set<FeedbackFieldId>(
    FEEDBACK_FIELDS_BY_CATEGORY[input.category]
  )

  return {
    ...input,
    frequency: fields.has("frequency") ? input.frequency : "unknown",
    steps: fields.has("steps") ? input.steps : "",
    expected: fields.has("expected") ? input.expected : "",
    problem: fields.has("problem") ? input.problem : "",
    benefit: fields.has("benefit") ? input.benefit : "",
    suggestion: fields.has("suggestion") ? input.suggestion : "",
  }
}

/**
 * Sends one feedback report to the configured inbox (`FEEDBACK_EMAIL_TO`,
 * falling back to `EMAIL_FROM`). Nothing is stored in the database: the email
 * is the record of the report.
 */
export async function submitFeedback(
  ctx: RequestContext,
  input: SubmitFeedbackParsed
): Promise<FeedbackSubmissionResult> {
  await assertRateLimit(
    `feedback:${ctx.userId}`,
    FEEDBACK_RATE_LIMIT,
    FEEDBACK_RATE_LIMIT_WINDOW_MS,
    {
      failOpen: true,
      code: "feedback_rate_limited",
      message:
        "You are sending feedback too quickly. Try again in a few minutes.",
    }
  )

  if (
    input.attachment &&
    attachmentBytes(input.attachment.data) > MAX_FEEDBACK_ATTACHMENT_BYTES
  ) {
    throw new ValidationError("The attached image is too large.")
  }

  const report = normalizeReport(input)

  const organization = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { id: true, name: true, slug: true },
  })
  if (!organization) throw new NotFoundError("Organization")

  const submittedAt = new Date()
  const recipients = feedbackRecipients()

  let delivery: EmailDelivery = "disabled"
  if (recipients.length > 0) {
    delivery = await deliverEmail({
      to: recipients,
      subject: feedbackSubject(report),
      html: renderFeedbackEmail({
        input: report,
        reporter: {
          name: ctx.userName,
          email: ctx.userEmail,
          role: ctx.role,
        },
        organization,
        submittedAt,
      }),
      // Replying in the mail client answers the tester directly.
      replyTo: report.contactEmail,
      attachments: report.attachment
        ? [
            {
              filename: report.attachment.filename,
              contentType: report.attachment.contentType,
              content: report.attachment.data,
            },
          ]
        : undefined,
    })
  }

  if (delivery === "failed") {
    throw new AppError(
      "feedback_delivery_failed",
      "Your feedback could not be sent. Please try again.",
      { status: 502 }
    )
  }

  if (delivery === "disabled") {
    // Local development and previews run without a mail provider: keep the
    // report in the server log instead of silently dropping it.
    console.info("[feedback] email delivery disabled; report follows:", {
      organization: organization.slug,
      userId: ctx.userId,
      category: report.category,
      impact: report.impact,
      title: report.title,
      description: report.description,
      frequency: report.frequency,
      steps: report.steps,
      expected: report.expected,
      problem: report.problem,
      benefit: report.benefit,
      suggestion: report.suggestion,
      page: report.page,
      contactEmail: report.contactEmail,
      allowContact: report.allowContact,
      context: report.context,
      attachment: report.attachment
        ? {
            filename: report.attachment.filename,
            contentType: report.attachment.contentType,
            bytes: attachmentBytes(report.attachment.data),
          }
        : null,
    })
  }

  return { delivered: delivery === "sent" }
}
