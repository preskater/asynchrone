/** Shared types and constants for billing, subscriptions and invoices. */

export const BILLING_PLANS = ["free", "team", "enterprise"] as const
export type BillingPlan = (typeof BILLING_PLANS)[number]

/**
 * Mirrors the provider's subscription status. `past_due` keeps the paid plan
 * during the retry window so a failed card does not erase the customer's data.
 */
export const SUBSCRIPTION_STATUSES = [
  "inactive",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const BILLING_INTERVALS = ["month", "year"] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

/** `stripe` for self-serve billing, `manual` for sales contracts. */
export const BILLING_PROVIDERS = ["stripe", "manual"] as const
export type BillingProviderId = (typeof BILLING_PROVIDERS)[number]

export interface InvoiceSummaryData {
  id: string
  number: string | null
  status: string
  amountDue: number
  amountPaid: number
  currency: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  periodStart: string | null
  periodEnd: string | null
  paidAt: string | null
  createdAt: string
}

export interface BillingUsageData {
  storageUsedBytes: number
  storageQuotaBytes: number
}

/** Everything the Settings → Billing page renders. */
export interface BillingOverviewData {
  plan: BillingPlan
  status: SubscriptionStatus
  provider: BillingProviderId
  /** Team prices in the smallest currency unit, from the server catalog. */
  prices: Record<BillingInterval, { amount: number; currency: string }>
  interval: BillingInterval | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: string | null
  manualOverride: boolean
  /** The organization has a provider customer, so the portal can be opened. */
  canManagePayment: boolean
  /** Checkout is offered only when a provider key is configured. */
  canSubscribe: boolean
  usage: BillingUsageData
  /** Empty for roles that cannot manage billing. */
  invoices: InvoiceSummaryData[]
}

export interface BillingRedirectData {
  url: string
}

/** Subscription state as the provider reports it. */
export interface ProviderSubscription {
  id: string
  customerId: string
  priceId: string | null
  status: string
  interval: BillingInterval | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: Date | null
  organizationId: string | null
  customerEmail: string | null
}

export interface ProviderCheckoutSession {
  id: string
  customerId: string
  subscriptionId: string | null
  organizationId: string | null
  customerEmail: string | null
}

/** An invoice as the provider reports it, before it is mirrored locally. */
export interface ProviderInvoice {
  id: string
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

/** The subset of the payment provider that the service needs. */
export interface BillingProviderPort {
  readonly configured: boolean
  createCheckoutSession(input: {
    organizationId: string
    organizationName: string
    customerId: string | null
    customerEmail: string
    interval: BillingInterval
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string }>
  createPortalSession(input: {
    customerId: string
    returnUrl: string
  }): Promise<{ url: string }>
  retrieveSubscription(id: string): Promise<ProviderSubscription>
  retrieveCheckoutSession(id: string): Promise<ProviderCheckoutSession>
  /** Read-side reconciliation, used when the local mirror is empty. */
  listInvoices(customerId: string, limit: number): Promise<ProviderInvoice[]>
}

/** Subscription shape the service reads and writes. */
export interface SubscriptionRecord {
  id: string
  organizationId: string
  plan: string
  status: string
  provider: string
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  providerPriceId: string | null
  billingInterval: string | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Only set when the provider itself reports a trial on the subscription. */
  trialEndsAt: Date | null
  manualOverride: boolean
}

/** Persistence the service needs, isolated so the webhook is unit-testable. */
export interface BillingRepositoryPort {
  getOrganization(organizationId: string): Promise<{
    id: string
    name: string
    slug: string
    metadata: string | null
    storageQuotaBytes: bigint | null
  } | null>
  getOrganizationIdByCustomer(customerId: string): Promise<string | null>
  getSubscriptionByOrganization(
    organizationId: string
  ): Promise<SubscriptionRecord | null>
  upsertSubscription(input: Omit<SubscriptionRecord, "id">): Promise<void>
  setCustomerId(organizationId: string, customerId: string): Promise<void>
  /**
   * "recorded" when this attempt may handle the event; "duplicate" when a
   * previous attempt already finished with it. Failed and stale `processing`
   * rows are reclaimable, so a provider retry can recover a transient error.
   */
  recordEvent(input: {
    provider: string
    eventId: string
    type: string
    organizationId: string | null
    status?: string
    error?: string | null
  }): Promise<"recorded" | "duplicate">
  markEvent(input: {
    provider: string
    eventId: string
    status: string
    error?: string | null
    organizationId?: string | null
  }): Promise<void>
  upsertInvoice(input: {
    organizationId: string
    subscriptionId: string | null
    providerInvoiceId: string
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
  }): Promise<void>
  listInvoices(
    organizationId: string,
    limit: number
  ): Promise<
    {
      id: string
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
      createdAt: Date
    }[]
  >
  sumUsedBytes(organizationId: string): Promise<number>
  /**
   * Customer-facing audit row for a plan change. Lives on the repository so the
   * billing service never reaches for a database client of its own.
   */
  recordPlanChange(input: {
    organizationId: string
    beforePlan: string | null
    plan: string
    status: string
  }): Promise<void>
  listOwnerRecipients(
    organizationId: string
  ): Promise<{ userId: string; email: string; name: string }[]>
}

/** Notification side effects, injected so the webhook stays testable. */
export interface BillingNotifierPort {
  paymentFailed(input: {
    organizationId: string
    invoiceNumber: string | null
    amountDue: number
    currency: string
    hostedInvoiceUrl: string | null
  }): Promise<void>
}
