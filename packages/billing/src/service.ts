import { entitlementsFor } from "@workspace/db/plans"

import type { RequestContext } from "@workspace/core/context"
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@workspace/core/errors"
import { roleRank } from "@workspace/organization/roles"

import {
  isPaidPlan,
  normalizePlan,
  normalizeStatus,
  planForOrganization,
  planForStatus,
  TEAM_PRICE,
} from "./plans"
import {
  parseCheckoutSessionObject,
  parseInvoiceObject,
  parseSubscriptionObject,
} from "./webhook-payload"
import {
  type BillingInterval,
  type BillingNotifierPort,
  type BillingOverviewData,
  type BillingPlan,
  type BillingProviderId,
  type BillingProviderPort,
  type BillingRedirectData,
  type BillingRepositoryPort,
  type ProviderSubscription,
  type SubscriptionStatus,
} from "./types"

const MANAGER_RANK = 3
const WEBHOOK_PROVIDER = "stripe"
const INVOICE_PAGE_SIZE = 12

/** Minimal shape of a provider webhook delivery. */
export interface BillingWebhookEvent {
  id: string
  type: string
  data: { object: unknown }
}

export type WebhookOutcome = "processed" | "ignored" | "duplicate"

export interface BillingServiceDeps {
  repo: BillingRepositoryPort
  provider: BillingProviderPort
  notifier: BillingNotifierPort
  /** Injected in tests. */
  now?: () => Date
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "")
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

export class BillingService {
  constructor(private readonly deps: BillingServiceDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date()
  }

  private requireManager(ctx: RequestContext) {
    if (roleRank(ctx.role) >= MANAGER_RANK) return
    throw new ForbiddenError("Only owners and admins can manage billing.", {
      code: "role_cannot_manage_billing",
    })
  }

  private toPlan(value: string | null | undefined): BillingPlan {
    return normalizePlan(value)
  }

  private toStatus(
    value: string | null | undefined,
    plan: BillingPlan
  ): SubscriptionStatus {
    if (value) return normalizeStatus(value)
    return isPaidPlan(plan) ? "active" : "inactive"
  }

  private toProviderId(value: string | null | undefined): BillingProviderId {
    return value === "manual" ? "manual" : "stripe"
  }

  // -------------------------------------------------------------------------
  // Settings → Billing
  // -------------------------------------------------------------------------

  async getOverview(ctx: RequestContext): Promise<BillingOverviewData> {
    const [organization, record] = await Promise.all([
      this.deps.repo.getOrganization(ctx.organizationId),
      this.deps.repo.getSubscriptionByOrganization(ctx.organizationId),
    ])
    if (!organization) throw new NotFoundError("Organization")

    // Invoices are finance data: only owners and admins may read them, and
    // only they may trigger the provider reconciliation below.
    const isManager = roleRank(ctx.role) >= MANAGER_RANK
    const plan = planForOrganization({
      metadata: organization.metadata,
      subscription: record ? { plan: record.plan } : null,
    })
    const [used, localInvoices] = await Promise.all([
      this.deps.repo.sumUsedBytes(ctx.organizationId),
      isManager
        ? this.deps.repo.listInvoices(ctx.organizationId, INVOICE_PAGE_SIZE)
        : Promise.resolve([]),
    ])
    // The mirror is filled by `invoice.paid`; if that delivery was missed (or
    // has not arrived yet) reconcile once so the table is never wrong.
    const invoices =
      isManager && localInvoices.length === 0 && record?.providerCustomerId
        ? await this.backfillInvoices(
            ctx.organizationId,
            record.id,
            record.providerCustomerId
          )
        : localInvoices

    const status = this.toStatus(record?.status, plan)
    const provider = this.toProviderId(record?.provider)

    return {
      plan,
      status,
      provider,
      prices: {
        month: {
          amount: TEAM_PRICE.month.amount,
          currency: TEAM_PRICE.month.currency,
        },
        year: {
          amount: TEAM_PRICE.year.amount,
          currency: TEAM_PRICE.year.currency,
        },
      },
      interval:
        record?.billingInterval === "month" ||
        record?.billingInterval === "year"
          ? record.billingInterval
          : null,
      currentPeriodEnd: record?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: record?.cancelAtPeriodEnd ?? false,
      trialEndsAt: record?.trialEndsAt?.toISOString() ?? null,
      manualOverride: record?.manualOverride ?? false,
      canManagePayment:
        isManager &&
        this.deps.provider.configured &&
        provider === "stripe" &&
        Boolean(record?.providerCustomerId),
      canSubscribe:
        isManager &&
        this.deps.provider.configured &&
        plan !== "enterprise" &&
        !record?.manualOverride,
      usage: {
        storageUsedBytes: used,
        storageQuotaBytes:
          organization.storageQuotaBytes !== null
            ? Number(organization.storageQuotaBytes)
            : entitlementsFor(plan).storageBytes,
      },
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        currency: invoice.currency,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        invoicePdf: invoice.invoicePdf,
        periodStart: invoice.periodStart?.toISOString() ?? null,
        periodEnd: invoice.periodEnd?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
      })),
    }
  }

  async startCheckout(
    ctx: RequestContext,
    input: { interval: BillingInterval; locale: string }
  ): Promise<BillingRedirectData> {
    this.requireManager(ctx)
    if (!this.deps.provider.configured) {
      throw new BadRequestError(
        "Billing is not configured on this deployment.",
        { code: "billing_not_configured" }
      )
    }

    const [organization, record] = await Promise.all([
      this.deps.repo.getOrganization(ctx.organizationId),
      this.deps.repo.getSubscriptionByOrganization(ctx.organizationId),
    ])
    if (!organization) throw new NotFoundError("Organization")

    if (record?.manualOverride) {
      throw new ConflictError(
        "This organization is billed through a manual contract.",
        { code: "billing_manual_contract" }
      )
    }

    const status = this.toStatus(record?.status, this.toPlan(record?.plan))
    if (
      record?.providerSubscriptionId &&
      (status === "active" || status === "trialing" || status === "past_due")
    ) {
      throw new ConflictError(
        "This organization already has a subscription. Use the customer portal to change it.",
        { code: "billing_subscription_exists" }
      )
    }

    const settingsPath = `/${input.locale}/${organization.slug}/settings`

    return this.deps.provider.createCheckoutSession({
      organizationId: ctx.organizationId,
      organizationName: organization.name,
      customerId: record?.providerCustomerId ?? null,
      customerEmail: ctx.userEmail,
      interval: input.interval,
      successUrl: `${baseUrl()}${settingsPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl()}${settingsPath}?checkout=cancelled`,
    })
  }

  /**
   * Fallback for the redirect back from Checkout: applies the subscription
   * immediately when the webhook has not landed yet. Idempotent, so running
   * both is expected.
   */
  async syncCheckout(
    ctx: RequestContext,
    sessionId: string
  ): Promise<BillingOverviewData> {
    this.requireManager(ctx)

    const session = await this.deps.provider.retrieveCheckoutSession(sessionId)
    // Stripe sessions are created with `client_reference_id` and
    // `metadata.organizationId`; a session that carries neither did not come
    // from this app and must never be attached to the caller's organization.
    if (session.organizationId !== ctx.organizationId) {
      throw new ForbiddenError("This checkout belongs to another organization.")
    }

    if (session.customerId) {
      await this.deps.repo.setCustomerId(ctx.organizationId, session.customerId)
    }

    if (session.subscriptionId) {
      const subscription = await this.deps.provider.retrieveSubscription(
        session.subscriptionId
      )
      await this.applySubscription(ctx.organizationId, subscription)
    }

    // `getOverview` reconciles invoices when the mirror is still empty, which is
    // exactly the case right after a checkout.
    return this.getOverview(ctx)
  }

  async openPortal(
    ctx: RequestContext,
    input: { locale: string }
  ): Promise<BillingRedirectData> {
    this.requireManager(ctx)
    if (!this.deps.provider.configured) {
      throw new BadRequestError(
        "Billing is not configured on this deployment.",
        { code: "billing_not_configured" }
      )
    }

    const [organization, record] = await Promise.all([
      this.deps.repo.getOrganization(ctx.organizationId),
      this.deps.repo.getSubscriptionByOrganization(ctx.organizationId),
    ])
    if (!organization) throw new NotFoundError("Organization")

    if (!record?.providerCustomerId || record.provider === "manual") {
      throw new BadRequestError("There is no payment method to manage yet.", {
        code: "billing_no_payment_account",
      })
    }

    return this.deps.provider.createPortalSession({
      customerId: record.providerCustomerId,
      returnUrl: `${baseUrl()}/${input.locale}/${organization.slug}/settings`,
    })
  }

  /**
   * Pulls invoices from the provider into the local mirror. Upserts on the
   * provider id, so running it repeatedly is a no-op. Returns the rows to
   * render; failures fall back to whatever is mirrored.
   */
  private async backfillInvoices(
    organizationId: string,
    subscriptionId: string | null,
    customerId: string
  ): Promise<Awaited<ReturnType<BillingRepositoryPort["listInvoices"]>>> {
    if (!this.deps.provider.configured) {
      return this.deps.repo.listInvoices(organizationId, INVOICE_PAGE_SIZE)
    }
    try {
      const providerInvoices = await this.deps.provider.listInvoices(
        customerId,
        INVOICE_PAGE_SIZE
      )
      for (const invoice of providerInvoices) {
        await this.deps.repo.upsertInvoice({
          organizationId,
          subscriptionId,
          providerInvoiceId: invoice.id,
          number: invoice.number,
          status: invoice.status,
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
          invoicePdf: invoice.invoicePdf,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        })
      }
    } catch (error) {
      console.error("[billing] failed to backfill invoices", error)
    }
    return this.deps.repo.listInvoices(organizationId, INVOICE_PAGE_SIZE)
  }

  // -------------------------------------------------------------------------
  // Webhook
  // -------------------------------------------------------------------------

  /**
   * Applies one provider event. The `(provider, eventId)` row is claimed
   * before any side effect, so a replayed delivery returns `duplicate` and
   * leaves the subscription untouched. A delivery whose previous attempt
   * failed, or that died mid-handler, is claimed again on the provider's retry
   * instead of being dropped.
   */
  async handleEvent(event: BillingWebhookEvent): Promise<WebhookOutcome> {
    const organizationId = await this.resolveOrganizationId(event)

    const claim = await this.deps.repo.recordEvent({
      provider: WEBHOOK_PROVIDER,
      eventId: event.id,
      type: event.type,
      organizationId,
      status: "processing",
    })
    if (claim === "duplicate") return "duplicate"

    try {
      const outcome = await this.dispatch(event, organizationId)
      await this.deps.repo.markEvent({
        provider: WEBHOOK_PROVIDER,
        eventId: event.id,
        status: outcome,
        organizationId,
      })
      return outcome
    } catch (error) {
      await this.deps.repo.markEvent({
        provider: WEBHOOK_PROVIDER,
        eventId: event.id,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        organizationId,
      })
      throw error
    }
  }

  private async resolveOrganizationId(
    event: BillingWebhookEvent
  ): Promise<string | null> {
    const object = asRecord(event.data.object)
    if (!object) return null

    switch (event.type) {
      case "checkout.session.completed": {
        const session = parseCheckoutSessionObject(object)
        if (!session) return null
        return (
          session.organizationId ??
          (session.customerId
            ? await this.deps.repo.getOrganizationIdByCustomer(
                session.customerId
              )
            : null)
        )
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = parseSubscriptionObject(object)
        if (!subscription) return null
        return (
          subscription.organizationId ??
          (subscription.customerId
            ? await this.deps.repo.getOrganizationIdByCustomer(
                subscription.customerId
              )
            : null)
        )
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = parseInvoiceObject(object)
        if (!invoice) return null
        return (
          invoice.organizationId ??
          (invoice.customerId
            ? await this.deps.repo.getOrganizationIdByCustomer(
                invoice.customerId
              )
            : null)
        )
      }
      default:
        return null
    }
  }

  private async dispatch(
    event: BillingWebhookEvent,
    organizationId: string | null
  ): Promise<WebhookOutcome> {
    const object = asRecord(event.data.object)
    if (!object || !organizationId) return "ignored"

    switch (event.type) {
      case "checkout.session.completed": {
        const session = parseCheckoutSessionObject(object)
        if (!session) return "ignored"
        if (session.customerId) {
          await this.deps.repo.setCustomerId(organizationId, session.customerId)
        }
        if (!session.subscriptionId) return "processed"
        const subscription = await this.deps.provider.retrieveSubscription(
          session.subscriptionId
        )
        await this.applySubscription(organizationId, subscription)
        return "processed"
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = parseSubscriptionObject(object)
        if (!subscription) return "ignored"
        await this.applySubscription(organizationId, subscription)
        return "processed"
      }

      case "invoice.paid": {
        const invoice = parseInvoiceObject(object)
        if (!invoice) return "ignored"
        const record =
          await this.deps.repo.getSubscriptionByOrganization(organizationId)
        await this.deps.repo.upsertInvoice({
          organizationId,
          subscriptionId: record?.id ?? null,
          providerInvoiceId: invoice.providerInvoiceId,
          number: invoice.number,
          status: invoice.status,
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
          invoicePdf: invoice.invoicePdf,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt ?? this.now(),
        })

        const subscriptionId = invoice.subscriptionId
        if (subscriptionId && !record?.manualOverride) {
          const subscription =
            await this.deps.provider.retrieveSubscription(subscriptionId)
          await this.applySubscription(organizationId, subscription)
        }
        return "processed"
      }

      case "invoice.payment_failed": {
        const invoice = parseInvoiceObject(object)
        if (!invoice) return "ignored"
        const record =
          await this.deps.repo.getSubscriptionByOrganization(organizationId)
        await this.deps.repo.upsertInvoice({
          organizationId,
          subscriptionId: record?.id ?? null,
          providerInvoiceId: invoice.providerInvoiceId,
          number: invoice.number,
          status: invoice.status,
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
          invoicePdf: invoice.invoicePdf,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        })

        if (record && !record.manualOverride) {
          await this.deps.repo.upsertSubscription({
            ...toUpsertInput(record),
            status: "past_due",
            plan: planForStatus("past_due"),
          })
        }

        await this.deps.notifier.paymentFailed({
          organizationId,
          invoiceNumber: invoice.number,
          amountDue: invoice.amountDue,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        })
        return "processed"
      }

      default:
        return "ignored"
    }
  }

  /**
   * Writes provider state to the subscription row. A manual (Enterprise)
   * override always wins: its plan is never downgraded by a webhook.
   */
  private async applySubscription(
    organizationId: string,
    subscription: ProviderSubscription
  ): Promise<void> {
    const existing =
      await this.deps.repo.getSubscriptionByOrganization(organizationId)
    if (existing?.manualOverride) return

    const status = normalizeStatus(subscription.status)
    const customerId =
      subscription.customerId || existing?.providerCustomerId || null
    const plan = planForStatus(status)

    await this.deps.repo.upsertSubscription({
      organizationId,
      plan,
      status,
      provider: "stripe",
      providerCustomerId: customerId,
      providerSubscriptionId: subscription.id,
      providerPriceId: subscription.priceId,
      billingInterval: subscription.interval,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEndsAt: status === "trialing" ? subscription.trialEndsAt : null,
      manualOverride: false,
    })

    // Entitlement changes are security-relevant: the customer-facing audit log
    // explains a storage or feature change nobody in the workspace initiated.
    if (existing?.plan !== plan) {
      await this.deps.repo.recordPlanChange({
        organizationId,
        beforePlan: existing?.plan ?? null,
        plan,
        status,
      })
    }
  }
}

/** Strips the persisted-only fields before an upsert. */
function toUpsertInput(record: {
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
  trialEndsAt: Date | null
  manualOverride: boolean
}) {
  return {
    organizationId: record.organizationId,
    plan: record.plan,
    status: record.status,
    provider: record.provider,
    providerCustomerId: record.providerCustomerId,
    providerSubscriptionId: record.providerSubscriptionId,
    providerPriceId: record.providerPriceId,
    billingInterval: record.billingInterval,
    currentPeriodEnd: record.currentPeriodEnd,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd,
    trialEndsAt: record.trialEndsAt,
    manualOverride: record.manualOverride,
  }
}
