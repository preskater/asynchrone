import { sendPaymentFailedEmail } from "@/lib/email"
import { notificationService } from "@/lib/notifications"
import { routing } from "@workspace/i18n/routing"

import type { BillingNotifierPort, BillingRepositoryPort } from "./types"

/**
 * Absolute link to Settings → Billing. Webhooks have no locale, so the
 * default one is used; the app redirects to the workspace slug afterwards.
 */
function billingUrl(slug: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "")
  return `${base}/${routing.defaultLocale}/${slug}/settings`
}

async function organizationOf(
  repo: BillingRepositoryPort,
  organizationId: string
) {
  const organization = await repo.getOrganization(organizationId)
  return {
    name: organization?.name ?? "your workspace",
    slug: organization?.slug,
  }
}

/**
 * Owner-facing notifications for billing events. Notifying is secondary to
 * updating the subscription, so failures are logged and swallowed.
 */
export class BillingNotifier implements BillingNotifierPort {
  constructor(private readonly repo: BillingRepositoryPort) {}

  private async recipients(organizationId: string) {
    try {
      return await this.repo.listOwnerRecipients(organizationId)
    } catch (error) {
      console.error("[billing] failed to load owner recipients", error)
      return []
    }
  }

  async paymentFailed(input: {
    organizationId: string
    invoiceNumber: string | null
    amountDue: number
    currency: string
    hostedInvoiceUrl: string | null
  }): Promise<void> {
    const recipients = await this.recipients(input.organizationId)
    if (recipients.length === 0) return

    const organization = await organizationOf(this.repo, input.organizationId)

    for (const recipient of recipients) {
      await notificationService.notify({
        organizationId: input.organizationId,
        userId: recipient.userId,
        actorId: "system",
        type: "billing.payment_failed",
        data: {
          invoiceNumber: input.invoiceNumber,
          amountDue: input.amountDue,
          currency: input.currency,
        },
      })

      if (!organization.slug) continue
      sendPaymentFailedEmail({
        to: recipient.email,
        organizationName: organization.name,
        amountDue: input.amountDue,
        currency: input.currency,
        url: input.hostedInvoiceUrl ?? billingUrl(organization.slug),
      })
    }
  }
}
