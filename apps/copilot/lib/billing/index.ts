import { BillingService } from "@workspace/billing"

import { BillingNotifier } from "./notifier"
import { BillingRepository } from "./repository"
import { StripeBillingProvider } from "./stripe-provider"

export const billingRepository = new BillingRepository()
export const billingProvider = new StripeBillingProvider()
export const billingNotifier = new BillingNotifier(billingRepository)

export const billingService = new BillingService({
  repo: billingRepository,
  provider: billingProvider,
  notifier: billingNotifier,
})

export { BillingService } from "@workspace/billing"
export { BillingRepository } from "./repository"
export { StripeBillingProvider } from "./stripe-provider"
export * from "@workspace/billing"
