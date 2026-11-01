/**
 * Billing types, plan catalog and the subscription state machine.
 *
 * Billing stays in Copilot's identity database: the service only talks to the
 * injected repository, provider and notifier ports, so the package never
 * opens a database of its own. Copilot binds the Prisma repository, Stripe
 * provider and email/notification notifier in `apps/copilot/lib/billing`.
 */
export * from "./types"
export * from "./plans"
export * from "./webhook-payload"
export {
  BillingService,
  type BillingWebhookEvent,
  type WebhookOutcome,
} from "./service"
