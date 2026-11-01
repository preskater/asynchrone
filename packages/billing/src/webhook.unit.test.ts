import { describe, expect, it, vi } from "vitest"

import { ForbiddenError } from "@workspace/core/errors"

import { BillingService } from "./service"
import type {
  BillingNotifierPort,
  BillingProviderPort,
  BillingRepositoryPort,
  ProviderInvoice,
  ProviderSubscription,
  SubscriptionRecord,
} from "./types"

const ORGANIZATION_ID = "org_1"
const CUSTOMER_ID = "cus_1"
const SUBSCRIPTION_ID = "sub_1"

const PERIOD_END = 1_790_000_000 // 2026-09-21T14:13:20Z

type InvoiceRow = Awaited<
  ReturnType<BillingRepositoryPort["listInvoices"]>
>[number]

/** In-memory stand-in for Prisma; mirrors the unique constraints we rely on. */
class FakeRepository implements BillingRepositoryPort {
  subscription: SubscriptionRecord | null = null
  events = new Map<
    string,
    { type: string; status: string; processedAt: number }
  >()
  invoices = new Map<string, InvoiceRow>()
  organization = {
    id: ORGANIZATION_ID,
    name: "Acme",
    slug: "acme",
    metadata: null as string | null,
    storageQuotaBytes: null as bigint | null,
  }

  planChanges: {
    organizationId: string
    beforePlan: string | null
    plan: string
    status: string
  }[] = []

  async getOrganization(organizationId: string) {
    return organizationId === ORGANIZATION_ID ? this.organization : null
  }

  async recordPlanChange(input: {
    organizationId: string
    beforePlan: string | null
    plan: string
    status: string
  }) {
    this.planChanges.push(input)
  }

  async getOrganizationIdByCustomer(customerId: string) {
    return this.subscription?.providerCustomerId === customerId
      ? ORGANIZATION_ID
      : null
  }

  async getSubscriptionByOrganization(organizationId: string) {
    return this.subscription?.organizationId === organizationId
      ? this.subscription
      : null
  }

  async upsertSubscription(
    input: Parameters<BillingRepositoryPort["upsertSubscription"]>[0]
  ) {
    this.subscription = {
      ...input,
      id: this.subscription?.id ?? "sub_row_1",
    }
  }

  async setCustomerId(organizationId: string, customerId: string) {
    if (this.subscription?.organizationId === organizationId) {
      this.subscription.providerCustomerId = customerId
      return
    }
    this.subscription = {
      id: "sub_row_1",
      organizationId,
      plan: "free",
      status: "inactive",
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: null,
      providerPriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      manualOverride: false,
    }
  }

  async recordEvent(
    input: Parameters<BillingRepositoryPort["recordEvent"]>[0]
  ) {
    const key = `${input.provider}:${input.eventId}`
    const now = Date.now()
    const existing = this.events.get(key)
    // Mirrors BillingRepository: only a failed or stale `processing` row is
    // claimable again; a finished delivery stays a duplicate.
    const retryable =
      existing !== undefined &&
      (existing.status === "failed" ||
        (existing.status === "processing" &&
          now - existing.processedAt > 10 * 60_000))
    if (existing && !retryable) return "duplicate" as const
    this.events.set(key, {
      type: input.type,
      status: input.status ?? "processed",
      processedAt: now,
    })
    return "recorded" as const
  }

  async markEvent(input: Parameters<BillingRepositoryPort["markEvent"]>[0]) {
    const key = `${input.provider}:${input.eventId}`
    const existing = this.events.get(key)
    if (!existing) return
    this.events.set(key, { ...existing, status: input.status })
  }

  async upsertInvoice(
    input: Parameters<BillingRepositoryPort["upsertInvoice"]>[0]
  ) {
    this.invoices.set(input.providerInvoiceId, {
      id: `inv_row_${this.invoices.size + 1}`,
      number: input.number,
      status: input.status,
      amountDue: input.amountDue,
      amountPaid: input.amountPaid,
      currency: input.currency,
      hostedInvoiceUrl: input.hostedInvoiceUrl,
      invoicePdf: input.invoicePdf,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      paidAt: input.paidAt,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
  }

  async listInvoices() {
    return [...this.invoices.values()]
  }

  async sumUsedBytes() {
    return 0
  }

  async listOwnerRecipients() {
    return [{ userId: "user_1", email: "owner@acme.test", name: "Owner" }]
  }
}

function subscriptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    status: "active",
    cancel_at_period_end: false,
    trial_end: null,
    metadata: { organizationId: ORGANIZATION_ID },
    items: {
      data: [
        {
          price: { id: "price_team_month", recurring: { interval: "month" } },
          current_period_end: PERIOD_END,
        },
      ],
    },
    ...overrides,
  }
}

function invoicePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_1",
    customer: CUSTOMER_ID,
    number: "INV-0001",
    status: "paid",
    amount_due: 1200,
    amount_paid: 1200,
    currency: "eur",
    hosted_invoice_url: "https://invoice.stripe.test/in_1",
    invoice_pdf: "https://invoice.stripe.test/in_1.pdf",
    period_start: PERIOD_END - 2_592_000,
    period_end: PERIOD_END,
    status_transitions: { paid_at: PERIOD_END },
    parent: {
      subscription_details: {
        subscription: SUBSCRIPTION_ID,
        metadata: { organizationId: ORGANIZATION_ID },
      },
    },
    ...overrides,
  }
}

function providerSubscription(
  overrides: Partial<ProviderSubscription> = {}
): ProviderSubscription {
  return {
    id: SUBSCRIPTION_ID,
    customerId: CUSTOMER_ID,
    priceId: "price_team_month",
    status: "active",
    interval: "month",
    currentPeriodEnd: new Date(PERIOD_END * 1000),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    organizationId: ORGANIZATION_ID,
    customerEmail: "owner@acme.test",
    ...overrides,
  }
}

function setup(
  options: {
    subscription?: ProviderSubscription
    invoices?: ProviderInvoice[]
  } = {}
) {
  const repo = new FakeRepository()
  const provider = {
    configured: true,
    createCheckoutSession: vi.fn(),
    createPortalSession: vi.fn(),
    retrieveSubscription: vi.fn(
      async () => options.subscription ?? providerSubscription()
    ),
    retrieveCheckoutSession: vi.fn(),
    listInvoices: vi.fn(async () => options.invoices ?? []),
  } satisfies BillingProviderPort
  const notifier = {
    paymentFailed: vi.fn(async () => {}),
  } satisfies BillingNotifierPort

  const service = new BillingService({ repo, provider, notifier })
  return { service, repo, provider, notifier }
}

describe("billing webhook", () => {
  it("activates Team from checkout.session.completed and ignores a replay", async () => {
    const { service, repo, provider } = setup({
      subscription: providerSubscription({ status: "trialing" }),
    })
    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: CUSTOMER_ID,
          subscription: SUBSCRIPTION_ID,
          client_reference_id: ORGANIZATION_ID,
          metadata: { organizationId: ORGANIZATION_ID },
        },
      },
    }

    await expect(service.handleEvent(event)).resolves.toBe("processed")

    expect(provider.retrieveSubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID)
    expect(repo.subscription).toMatchObject({
      organizationId: ORGANIZATION_ID,
      plan: "team",
      status: "trialing",
      provider: "stripe",
      providerCustomerId: CUSTOMER_ID,
      providerSubscriptionId: SUBSCRIPTION_ID,
      billingInterval: "month",
    })

    // The customer-facing audit trail explains an entitlement change nobody in
    // the workspace asked for.
    expect(repo.planChanges).toEqual([
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        plan: "team",
        status: "trialing",
      }),
    ])

    const snapshot = { ...repo.subscription }
    await expect(service.handleEvent(event)).resolves.toBe("duplicate")
    expect(repo.subscription).toEqual(snapshot)
    expect(repo.planChanges).toHaveLength(1)
    expect(provider.retrieveSubscription).toHaveBeenCalledTimes(1)
  })

  it("re-processes a delivery whose previous attempt failed", async () => {
    const { service, repo } = setup()
    // Stripe retries any delivery that did not get a 2xx; the row left by the
    // failed attempt must not swallow the retry as a duplicate.
    repo.events.set("stripe:evt_retry", {
      type: "customer.subscription.updated",
      status: "failed",
      processedAt: Date.now(),
    })

    await expect(
      service.handleEvent({
        id: "evt_retry",
        type: "customer.subscription.updated",
        data: { object: subscriptionPayload() },
      })
    ).resolves.toBe("processed")

    expect(repo.subscription).toMatchObject({ plan: "team", status: "active" })
    expect(repo.events.get("stripe:evt_retry")?.status).toBe("processed")
  })

  it("re-claims a delivery that was claimed but never finished", async () => {
    const { service, repo } = setup()
    repo.events.set("stripe:evt_stale", {
      type: "customer.subscription.updated",
      status: "processing",
      processedAt: Date.now() - 11 * 60_000,
    })

    await expect(
      service.handleEvent({
        id: "evt_stale",
        type: "customer.subscription.updated",
        data: { object: subscriptionPayload() },
      })
    ).resolves.toBe("processed")
    expect(repo.subscription).toMatchObject({ plan: "team" })
  })

  it("keeps a delivery that is still being processed idempotent", async () => {
    const { service, repo } = setup()
    repo.events.set("stripe:evt_running", {
      type: "customer.subscription.updated",
      status: "processing",
      processedAt: Date.now(),
    })

    await expect(
      service.handleEvent({
        id: "evt_running",
        type: "customer.subscription.updated",
        data: { object: subscriptionPayload() },
      })
    ).resolves.toBe("duplicate")
    expect(repo.subscription).toBeNull()
  })

  it("maps customer.subscription.updated to the paid plan and interval", async () => {
    const { service, repo } = setup()

    await service.handleEvent({
      id: "evt_updated",
      type: "customer.subscription.updated",
      data: {
        object: subscriptionPayload({
          cancel_at_period_end: true,
          items: {
            data: [
              {
                price: {
                  id: "price_team_year",
                  recurring: { interval: "year" },
                },
                current_period_end: PERIOD_END,
              },
            ],
          },
        }),
      },
    })

    expect(repo.subscription).toMatchObject({
      plan: "team",
      status: "active",
      billingInterval: "year",
      cancelAtPeriodEnd: true,
      providerPriceId: "price_team_year",
    })
    expect(repo.subscription?.currentPeriodEnd).toEqual(
      new Date(PERIOD_END * 1000)
    )
  })

  it("downgrades to Starter when customer.subscription.deleted arrives", async () => {
    const { service, repo } = setup()
    await service.handleEvent({
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: subscriptionPayload() },
    })
    expect(repo.subscription?.plan).toBe("team")

    await service.handleEvent({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: subscriptionPayload({ status: "canceled" }) },
    })

    expect(repo.subscription).toMatchObject({
      plan: "free",
      status: "canceled",
    })
  })

  it("never downgrades a manual Enterprise override", async () => {
    const { service, repo } = setup()
    repo.subscription = {
      id: "sub_row_1",
      organizationId: ORGANIZATION_ID,
      plan: "enterprise",
      status: "active",
      provider: "manual",
      providerCustomerId: CUSTOMER_ID,
      providerSubscriptionId: null,
      providerPriceId: null,
      billingInterval: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      manualOverride: true,
    }

    await service.handleEvent({
      id: "evt_deleted_manual",
      type: "customer.subscription.deleted",
      data: { object: subscriptionPayload({ status: "canceled" }) },
    })

    expect(repo.subscription).toMatchObject({
      plan: "enterprise",
      provider: "manual",
      manualOverride: true,
    })
  })

  it("stores a paid invoice and refreshes the subscription", async () => {
    const { service, repo } = setup()

    await expect(
      service.handleEvent({
        id: "evt_invoice_paid",
        type: "invoice.paid",
        data: { object: invoicePayload() },
      })
    ).resolves.toBe("processed")

    const invoice = repo.invoices.get("in_1")
    expect(invoice).toMatchObject({
      number: "INV-0001",
      status: "paid",
      amountPaid: 1200,
      currency: "eur",
    })
    expect(invoice?.paidAt).toEqual(new Date(PERIOD_END * 1000))
    expect(repo.subscription).toMatchObject({ plan: "team", status: "active" })
  })

  it("keeps Team on a failed payment, records it and notifies the owners once", async () => {
    const { service, repo, notifier } = setup()
    await service.handleEvent({
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: subscriptionPayload() },
    })

    const event = {
      id: "evt_payment_failed",
      type: "invoice.payment_failed",
      data: { object: invoicePayload({ status: "open", amount_paid: 0 }) },
    }

    await expect(service.handleEvent(event)).resolves.toBe("processed")
    expect(repo.subscription).toMatchObject({
      plan: "team",
      status: "past_due",
    })
    expect(repo.invoices.get("in_1")?.status).toBe("open")
    expect(notifier.paymentFailed).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      invoiceNumber: "INV-0001",
      amountDue: 1200,
      currency: "eur",
      hostedInvoiceUrl: "https://invoice.stripe.test/in_1",
    })

    await expect(service.handleEvent(event)).resolves.toBe("duplicate")
    expect(notifier.paymentFailed).toHaveBeenCalledTimes(1)
  })

  it("ignores unrelated events but still records them", async () => {
    const { service, repo } = setup()

    await expect(
      service.handleEvent({
        id: "evt_other",
        type: "customer.created",
        data: { object: { id: "cus_1" } },
      })
    ).resolves.toBe("ignored")

    expect(repo.events.get("stripe:evt_other")?.status).toBe("ignored")
    expect(repo.subscription).toBeNull()
  })
})

describe("billing overview", () => {
  const ctx = {
    userId: "user_1",
    userName: "Owner",
    userEmail: "owner@acme.test",
    organizationId: ORGANIZATION_ID,
    role: "owner" as const,
  }

  it("mirrors provider invoices when the local table is still empty", async () => {
    const { service, repo, provider } = setup({
      invoices: [
        {
          id: "in_live_1",
          number: "INV-0042",
          status: "paid",
          amountDue: 12000,
          amountPaid: 12000,
          currency: "eur",
          hostedInvoiceUrl: "https://invoice.stripe.test/in_live_1",
          invoicePdf: "https://invoice.stripe.test/in_live_1.pdf",
          periodStart: new Date(PERIOD_END * 1000),
          periodEnd: new Date(PERIOD_END * 1000),
          paidAt: new Date(PERIOD_END * 1000),
        },
      ],
    })
    await service.handleEvent({
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: subscriptionPayload() },
    })

    const overview = await service.getOverview(ctx)

    expect(provider.listInvoices).toHaveBeenCalledWith(CUSTOMER_ID, 12)
    expect(overview.invoices).toHaveLength(1)
    expect(overview.invoices[0]).toMatchObject({
      number: "INV-0042",
      status: "paid",
      amountPaid: 12000,
      hostedInvoiceUrl: "https://invoice.stripe.test/in_live_1",
    })
    expect(repo.invoices.get("in_live_1")?.status).toBe("paid")
  })

  it("does not call the provider once invoices are mirrored", async () => {
    const { service, provider } = setup()
    await service.handleEvent({
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: subscriptionPayload() },
    })
    await service.handleEvent({
      id: "evt_paid",
      type: "invoice.paid",
      data: { object: invoicePayload({ id: "in_mirror" }) },
    })

    const overview = await service.getOverview(ctx)

    expect(provider.listInvoices).not.toHaveBeenCalled()
    expect(overview.invoices).toHaveLength(1)
  })

  it("exposes the server price catalog", async () => {
    const { service } = setup()

    const overview = await service.getOverview(ctx)

    expect(overview.prices).toEqual({
      month: { amount: 1200, currency: "eur" },
      year: { amount: 12000, currency: "eur" },
    })
  })

  it("hides invoices from roles that cannot manage billing", async () => {
    const { service, repo, provider } = setup({
      invoices: [
        {
          id: "in_secret",
          number: "INV-0009",
          status: "paid",
          amountDue: 12000,
          amountPaid: 12000,
          currency: "eur",
          hostedInvoiceUrl: "https://invoice.stripe.test/in_secret",
          invoicePdf: null,
          periodStart: null,
          periodEnd: null,
          paidAt: null,
        },
      ],
    })
    // A provider customer exists, so a manager would also backfill invoices.
    await repo.setCustomerId(ORGANIZATION_ID, CUSTOMER_ID)

    const overview = await service.getOverview({ ...ctx, role: "member" })

    expect(provider.listInvoices).not.toHaveBeenCalled()
    expect(overview.invoices).toEqual([])
    expect(overview.canSubscribe).toBe(false)
    expect(overview.canManagePayment).toBe(false)
    expect(overview.usage.storageQuotaBytes).toBeGreaterThan(0)
  })
})

describe("checkout sync", () => {
  const ctx = {
    userId: "user_1",
    userName: "Owner",
    userEmail: "owner@acme.test",
    organizationId: ORGANIZATION_ID,
    role: "owner" as const,
  }

  function checkoutSession(organizationId: string | null) {
    return {
      id: "cs_sync",
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      organizationId,
      customerEmail: "owner@acme.test",
    }
  }

  it("applies the subscription of the caller's own session", async () => {
    const { service, repo, provider } = setup()
    provider.retrieveCheckoutSession.mockResolvedValue(
      checkoutSession(ORGANIZATION_ID)
    )

    const overview = await service.syncCheckout(ctx, "cs_sync")

    expect(provider.retrieveSubscription).toHaveBeenCalledWith(SUBSCRIPTION_ID)
    expect(repo.subscription).toMatchObject({ plan: "team", status: "active" })
    expect(overview.plan).toBe("team")
  })

  it("refuses a session that belongs to another organization", async () => {
    const { service, provider, repo } = setup()
    provider.retrieveCheckoutSession.mockResolvedValue(
      checkoutSession("org_other")
    )

    await expect(service.syncCheckout(ctx, "cs_sync")).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(provider.retrieveSubscription).not.toHaveBeenCalled()
    expect(repo.subscription).toBeNull()
  })

  it("refuses a session that carries no organization", async () => {
    const { service, provider, repo } = setup()
    // e.g. a session created by hand in the Stripe dashboard
    provider.retrieveCheckoutSession.mockResolvedValue(checkoutSession(null))

    await expect(service.syncCheckout(ctx, "cs_sync")).rejects.toBeInstanceOf(
      ForbiddenError
    )
    expect(provider.retrieveSubscription).not.toHaveBeenCalled()
    expect(repo.subscription).toBeNull()
  })
})
