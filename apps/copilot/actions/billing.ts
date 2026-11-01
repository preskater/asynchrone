"use server"

import { z } from "zod"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { billingService } from "@/lib/billing"
import { BILLING_INTERVALS } from "@/lib/billing/types"
import { revalidateOrgPath } from "@/lib/organization/paths"

/**
 * Locale is only used to build the provider's return URLs, so a plain two
 * letter check is enough; anything odd falls back to the default locale.
 */
const localeSchema = z
  .string()
  .regex(/^[a-z]{2}$/)
  .catch("en")

const checkoutSchema = z.object({
  interval: z.enum(BILLING_INTERVALS),
  locale: localeSchema,
})

const portalSchema = z.object({ locale: localeSchema })

const syncCheckoutSchema = z.object({
  sessionId: z.string().min(1).max(200),
})

export const getBillingOverviewAction = withAction(async () => {
  const ctx = await getRequestContext()
  return billingService.getOverview(ctx)
})

export const createCheckoutSessionAction = withAction(
  async (input: unknown) => {
    const ctx = await getRequestContext()
    const parsed = await parseLocalized(checkoutSchema, input)
    return billingService.startCheckout(ctx, parsed)
  }
)

export const createPortalSessionAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(portalSchema, input)
  return billingService.openPortal(ctx, parsed)
})

export const syncCheckoutSessionAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(syncCheckoutSchema, input)
  const overview = await billingService.syncCheckout(ctx, parsed.sessionId)
  await revalidateOrgPath(ctx.organizationId, "/settings")
  return overview
})
