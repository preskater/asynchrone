/**
 * Structural parsers for Stripe webhook payloads.
 *
 * Webhook bodies are untrusted JSON, so every field is read defensively rather
 * than cast to the SDK's types. Keeping this separate from `stripe-provider.ts`
 * also lets the webhook handler be unit-tested with plain objects.
 */

import type { BillingInterval, ProviderSubscription } from "./types"

type Json = Record<string, unknown>

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" ? (value as Json) : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function dateValue(value: unknown): Date | null {
  const seconds = numberValue(value)
  return seconds === null ? null : new Date(seconds * 1000)
}

/** `customer` is an id or an expanded object, depending on the event. */
export function customerIdOf(value: unknown): string | null {
  if (typeof value === "string") return value
  const customer = asRecord(value)
  return customer ? stringValue(customer.id) : null
}

export function customerEmailOf(
  object: Json,
  customer?: unknown
): string | null {
  const details = asRecord(object.customer_details)
  if (details) {
    const email = stringValue(details.email)
    if (email) return email
  }
  const direct = stringValue(object.customer_email)
  if (direct) return direct
  const expanded = asRecord(customer ?? object.customer)
  return expanded && expanded.deleted !== true
    ? stringValue(expanded.email)
    : null
}

export function organizationIdOf(...sources: unknown[]): string | null {
  for (const source of sources) {
    const record = asRecord(source)
    if (!record) continue
    const fromMetadata = stringValue(asRecord(record.metadata)?.organizationId)
    if (fromMetadata) return fromMetadata
    const direct = stringValue(record.organizationId)
    if (direct) return direct
    const reference = stringValue(record.client_reference_id)
    if (reference) return reference
  }
  return null
}

function intervalOf(value: unknown): BillingInterval | null {
  return value === "month" || value === "year" ? value : null
}

/**
 * Reads a subscription object. The current API version moved
 * `current_period_end` onto the items, so the latest item wins.
 */
export function parseSubscriptionObject(
  value: unknown
): ProviderSubscription | null {
  const subscription = asRecord(value)
  if (!subscription) return null

  const id = stringValue(subscription.id)
  if (!id) return null

  const items = asRecord(subscription.items)
  const itemList = Array.isArray(items?.data) ? (items.data as unknown[]) : []
  const items_ = itemList.map(asRecord).filter((item): item is Json => !!item)

  const periodEnd = items_.reduce<number | null>((latest, item) => {
    const end = numberValue(item.current_period_end)
    if (end === null) return latest
    return latest === null || end > latest ? end : latest
  }, null)

  const firstPrice = asRecord(asRecord(items_[0]?.price))
  const recurring = asRecord(firstPrice?.recurring)

  return {
    id,
    customerId: customerIdOf(subscription.customer) ?? "",
    priceId: stringValue(firstPrice?.id),
    status: stringValue(subscription.status) ?? "inactive",
    interval: intervalOf(recurring?.interval),
    currentPeriodEnd:
      dateValue(periodEnd) ?? dateValue(subscription.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
    trialEndsAt: dateValue(subscription.trial_end),
    organizationId: organizationIdOf(subscription),
    customerEmail: customerEmailOf(subscription),
  }
}

export interface ParsedInvoice {
  providerInvoiceId: string
  subscriptionId: string | null
  customerId: string | null
  organizationId: string | null
  number: string | null
  status: string
  amountDue: number
  amountPaid: number
  currency: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  periodStart: Date | null
  periodEnd: Date | null
  paidAt: Date | null
}

export function parseInvoiceObject(value: unknown): ParsedInvoice | null {
  const invoice = asRecord(value)
  if (!invoice) return null

  const id = stringValue(invoice.id)
  if (!id) return null

  // Stripe's 2025 API moved the subscription onto `parent`; older payloads
  // still carry `subscription` and `subscription_details` at the top level.
  const parent = asRecord(invoice.parent)
  const parentSubscription = asRecord(parent?.subscription_details)
  const legacySubscription = asRecord(invoice.subscription_details)

  const subscriptionId =
    stringValue(parentSubscription?.subscription) ??
    stringValue(legacySubscription?.subscription) ??
    stringValue(invoice.subscription)

  const transitions = asRecord(invoice.status_transitions)

  return {
    providerInvoiceId: id,
    subscriptionId,
    customerId: customerIdOf(invoice.customer),
    organizationId: organizationIdOf(
      parentSubscription,
      legacySubscription,
      invoice
    ),
    number: stringValue(invoice.number),
    status: stringValue(invoice.status) ?? "open",
    amountDue: numberValue(invoice.amount_due) ?? 0,
    amountPaid: numberValue(invoice.amount_paid) ?? 0,
    currency: stringValue(invoice.currency) ?? "eur",
    hostedInvoiceUrl: stringValue(invoice.hosted_invoice_url),
    invoicePdf: stringValue(invoice.invoice_pdf),
    periodStart: dateValue(invoice.period_start),
    periodEnd: dateValue(invoice.period_end),
    paidAt: dateValue(transitions?.paid_at),
  }
}

export interface ParsedCheckoutSession {
  id: string
  customerId: string | null
  subscriptionId: string | null
  organizationId: string | null
  customerEmail: string | null
}

export function parseCheckoutSessionObject(
  value: unknown
): ParsedCheckoutSession | null {
  const session = asRecord(value)
  if (!session) return null

  const id = stringValue(session.id)
  if (!id) return null

  return {
    id,
    customerId: customerIdOf(session.customer),
    subscriptionId:
      stringValue(session.subscription) ??
      stringValue(asRecord(session.subscription)?.id),
    organizationId: organizationIdOf(session),
    customerEmail: customerEmailOf(session),
  }
}
