import { NextResponse } from "next/server"

import { billingService } from "@/lib/billing"
import {
  StripeBillingProvider,
  getStripeWebhookSecret,
} from "@/lib/billing/stripe-provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stripe webhook endpoint. The signature is verified over the untouched body,
 * then the event is handed to `BillingService`, which dedupes on the provider
 * event id. Non-2xx responses make Stripe retry, so a duplicate delivery — the
 * normal outcome of that retry — answers 200.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = getStripeWebhookSecret()
  const signature = request.headers.get("stripe-signature")

  if (!secret) {
    console.error("[billing] STRIPE_WEBHOOK_SECRET is not configured")
    return NextResponse.json(
      { error: "Billing webhooks are not configured." },
      { status: 503 }
    )
  }
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    )
  }

  const payload = await request.text()

  let event: { id: string; type: string; data: { object: unknown } }
  try {
    event = new StripeBillingProvider().constructEvent(
      payload,
      signature,
      secret
    )
  } catch (error) {
    console.error("[billing] invalid webhook signature", error)
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 })
  }

  const object = event.data?.object
  if (!object) {
    // Thin events (`stripe listen --all-thin`, or a `thin` endpoint) only carry
    // a reference; this handler parses snapshot payloads.
    console.warn(
      `[billing] ignoring ${event.type}: no snapshot payload — forward snapshot events (--events / --all-snapshot)`
    )
    return NextResponse.json({ received: true, outcome: "ignored" })
  }

  try {
    const outcome = await billingService.handleEvent({
      id: event.id,
      type: event.type,
      data: { object },
    })
    return NextResponse.json({ received: true, outcome })
  } catch (error) {
    console.error(`[billing] failed to handle ${event.type}`, error)
    return NextResponse.json(
      { error: "Webhook handling failed." },
      { status: 500 }
    )
  }
}
