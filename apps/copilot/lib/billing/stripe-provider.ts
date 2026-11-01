import Stripe from "stripe"

import { TEAM_PRICE } from "./plans"
import type {
  BillingInterval,
  BillingProviderPort,
  ProviderCheckoutSession,
  ProviderInvoice,
  ProviderSubscription,
} from "./types"

let client: Stripe | null = null

/** The SDK client, or null when the deployment has no provider key. */
export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null
  client ??= new Stripe(secretKey, { maxNetworkRetries: 2 })
  return client
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null
}

function requireClient(): Stripe {
  const stripe = getStripeClient()
  if (!stripe) {
    throw new Error("STRIPE_SECRET_KEY is not configured.")
  }
  return stripe
}

function toDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null
}

function intervalOf(value: string | null | undefined): BillingInterval | null {
  return value === "month" || value === "year" ? value : null
}

function priceReference(interval: BillingInterval): string | null {
  const configured =
    interval === "month"
      ? process.env.STRIPE_PRICE_TEAM_MONTHLY
      : process.env.STRIPE_PRICE_TEAM_YEARLY
  return configured || null
}

function organizationIdOf(
  metadata: Stripe.Metadata | null | undefined
): string | null {
  const value = metadata?.organizationId
  return typeof value === "string" && value.length > 0 ? value : null
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer) return null
  return typeof customer === "string" ? customer : customer.id
}

function customerEmailOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | null {
  if (!customer || typeof customer === "string" || customer.deleted) return null
  return customer.email ?? null
}

function toProviderSubscription(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  const periodEnd = subscription.items.data.reduce<number | null>(
    (latest, entry) =>
      latest === null || entry.current_period_end > latest
        ? entry.current_period_end
        : latest,
    null
  )

  return {
    id: subscription.id,
    customerId: customerIdOf(subscription.customer) ?? "",
    priceId: item?.price?.id ?? null,
    status: subscription.status,
    interval: intervalOf(item?.price?.recurring?.interval),
    currentPeriodEnd: toDate(periodEnd),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    trialEndsAt: toDate(subscription.trial_end),
    organizationId: organizationIdOf(subscription.metadata),
    customerEmail: customerEmailOf(subscription.customer),
  } satisfies ProviderSubscription
}

/**
 * Stripe implementation of {@link BillingProviderPort}. Prices come from
 * `STRIPE_PRICE_TEAM_MONTHLY` / `STRIPE_PRICE_TEAM_YEARLY` when set; otherwise
 * the Team price is sent inline so a test-mode workspace works without
 * configuring products first. Automatic tax is opt-in through
 * `STRIPE_AUTOMATIC_TAX=true` because it requires Stripe Tax to be configured
 * in the dashboard.
 */
export class StripeBillingProvider implements BillingProviderPort {
  get configured(): boolean {
    return isStripeConfigured()
  }

  async createCheckoutSession(input: {
    organizationId: string
    organizationName: string
    customerId: string | null
    customerEmail: string
    interval: BillingInterval
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string }> {
    const stripe = requireClient()
    const price = TEAM_PRICE[input.interval]
    const priceId = priceReference(input.interval)
    const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true"

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.organizationId,
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.customerEmail,
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: price.currency,
                unit_amount: price.amount,
                recurring: { interval: input.interval },
                product_data: {
                  name: `Asynchrone Space Team — ${input.organizationName}`,
                },
              },
            },
      ],
      metadata: { organizationId: input.organizationId },
      subscription_data: {
        // The Team trial is a free, card-less window modelled on the
        // organization (ADR 0021), so checkout always charges immediately.
        metadata: { organizationId: input.organizationId },
      },
      billing_address_collection: automaticTax ? "required" : "auto",
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: automaticTax },
    })

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.")
    }
    return { url: session.url }
  }

  async createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ url: string }> {
    const stripe = requireClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    })
    return { url: session.url }
  }

  async retrieveSubscription(id: string): Promise<ProviderSubscription> {
    const stripe = requireClient()
    const subscription = await stripe.subscriptions.retrieve(id)
    return toProviderSubscription(subscription)
  }

  async retrieveCheckoutSession(id: string): Promise<ProviderCheckoutSession> {
    const stripe = requireClient()
    const session = await stripe.checkout.sessions.retrieve(id)
    return {
      id: session.id,
      customerId: customerIdOf(session.customer) ?? "",
      subscriptionId:
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null),
      organizationId:
        session.client_reference_id ??
        organizationIdOf(session.metadata) ??
        null,
      customerEmail: session.customer_details?.email ?? session.customer_email,
    }
  }

  async listInvoices(
    customerId: string,
    limit: number
  ): Promise<ProviderInvoice[]> {
    const stripe = requireClient()
    const invoices = await stripe.invoices.list({ customer: customerId, limit })
    return invoices.data.map((invoice) => ({
      id: invoice.id ?? "",
      number: invoice.number,
      status: invoice.status ?? "open",
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      periodStart: toDate(invoice.period_start),
      periodEnd: toDate(invoice.period_end),
      paidAt: toDate(invoice.status_transitions?.paid_at),
    }))
  }

  /** Verifies the Stripe signature over the untouched request body. */
  constructEvent(payload: string, signature: string, secret: string) {
    return requireClient().webhooks.constructEvent(payload, signature, secret)
  }
}
