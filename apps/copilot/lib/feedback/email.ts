import { escapeHtml } from "@/lib/email"

import type { SubmitFeedbackInput } from "./types"

/**
 * Renders the internal notification email for one feedback report.
 *
 * The email is read by the Asynchrone Space team, not by the tester, so it stays in
 * English like the other transactional emails. Every value is escaped: the
 * report is user-generated content.
 */

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;vertical-align:top;font-size:13px;line-height:20px;color:#71717a;white-space:nowrap">${label}</td>
    <td style="padding:6px 0;vertical-align:top;font-size:13px;line-height:20px;color:#18181b">${escapeHtml(value)}</td>
  </tr>`
}

function block(label: string, value: string) {
  return `<h2 style="margin:24px 0 4px;font-size:13px;line-height:20px;color:#71717a;text-transform:uppercase;letter-spacing:0.04em">${label}</h2>
  <p style="margin:0;font-size:14px;line-height:22px;color:#18181b;white-space:pre-wrap">${escapeHtml(value)}</p>`
}

/**
 * The category decides which questions the form asked, so the email only
 * renders the answers that belong to the report type.
 */
function extraBlocks(input: SubmitFeedbackInput): string[] {
  const blocks: string[] = []

  switch (input.category) {
    case "bug":
      if (input.frequency !== "unknown") {
        blocks.push(block("Frequency", input.frequency))
      }
      if (input.steps) blocks.push(block("Steps to reproduce", input.steps))
      if (input.expected) {
        blocks.push(block("Expected behaviour", input.expected))
      }
      break
    case "idea":
      if (input.problem) {
        blocks.push(block("Problem this solves", input.problem))
      }
      if (input.benefit) blocks.push(block("Who benefits", input.benefit))
      break
    case "design":
      if (input.problem) blocks.push(block("What feels off", input.problem))
      if (input.suggestion) {
        blocks.push(block("Suggested improvement", input.suggestion))
      }
      break
    case "performance":
      if (input.frequency !== "unknown") {
        blocks.push(block("Frequency", input.frequency))
      }
      if (input.steps) {
        blocks.push(block("What you were doing", input.steps))
      }
      if (input.expected) blocks.push(block("Expected speed", input.expected))
      break
  }

  return blocks
}

export function feedbackRecipients(): string[] {
  const configured = (process.env.FEEDBACK_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)

  if (configured.length > 0) return configured

  // Fall back to the sender so a single-address setup still receives reports.
  const fallback = (process.env.EMAIL_FROM ?? "").trim()
  return fallback ? [fallback] : []
}

export function feedbackSubject(input: SubmitFeedbackInput) {
  // Single-line subject: collapse any whitespace from a crafted payload.
  const title = input.title.replace(/\s+/g, " ").trim()
  const truncated = title.length > 110 ? `${title.slice(0, 109)}…` : title
  return `[Feedback · ${input.category}] ${truncated}`
}

export function renderFeedbackEmail({
  input,
  reporter,
  organization,
  submittedAt,
}: {
  input: SubmitFeedbackInput
  reporter: { name: string; email: string; role: string }
  organization: { name: string; slug: string; id: string }
  submittedAt: Date
}): string {
  const details = [
    row("Category", input.category),
    row("Impact", input.impact),
    row("Contact", `${reporter.name} <${input.contactEmail}>`),
    row("Can be contacted", input.allowContact ? "Yes" : "No"),
    row("Account email", reporter.email),
    row("Role", reporter.role),
    row("Organization", `${organization.name} (${organization.slug})`),
    row("Organization id", organization.id),
    row("Page", input.page || "—"),
    row("Locale", input.context.locale),
    row("Timezone", input.context.timezone || "—"),
    row("Viewport", input.context.viewport || "—"),
    row("User agent", input.context.userAgent || "—"),
    row("Submitted at", submittedAt.toISOString()),
  ].join("")

  const narrative = [
    block("Details", input.description),
    ...extraBlocks(input),
  ].join("")

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background-color:#ffffff;border-radius:8px;padding:32px">
            <tr>
              <td>
                <h1 style="margin:0 0 8px;font-size:20px;line-height:28px">New feedback from ${escapeHtml(organization.name)}</h1>
                <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#52525b">${escapeHtml(input.title)}</p>
                ${narrative}
                <h2 style="margin:24px 0 8px;font-size:13px;line-height:20px;color:#71717a;text-transform:uppercase;letter-spacing:0.04em">Context</h2>
                <table role="presentation" cellpadding="0" cellspacing="0">${details}</table>
                <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#71717a">
                  ${input.attachment ? `Attached: ${escapeHtml(input.attachment.filename)} (${input.attachment.contentType})` : "No attachment."}
                  · Reply to this email to answer ${escapeHtml(input.contactEmail)}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
