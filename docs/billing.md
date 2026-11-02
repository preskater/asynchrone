# Billing

Plans are paid through Stripe Checkout and managed in the Stripe Customer
Portal. Asynchrone Space keeps a local mirror of the subscription and invoices
so the app can enforce limits without calling the provider. The decision is recorded in
[ADR 0023](adr/0023-bill-subscriptions-through-stripe.md); the free
Team trial is separate and lives in
[ADR 0021](adr/0021-team-trial-without-billing.md).

## Where things live

| Concern                           | Location                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tables                            | `Subscription`, `Invoice`, `BillingEvent` (`packages/db/prisma/schema.prisma`)                              |
| Invoice mirror                    | filled by `invoice.paid` / `invoice.payment_failed`, backfilled on view when empty                          |
| Plan state and status mapping     | `apps/copilot/lib/billing/plans.ts`                                                                             |
| Stripe client and request shaping | `apps/copilot/lib/billing/stripe-provider.ts`                                                                   |
| Webhook handling                  | `apps/copilot/lib/billing/service.ts`, `apps/copilot/app/api/webhooks/stripe/route.ts`                              |
| Settings → Billing                | `apps/copilot/components/billing/billing-panel.tsx`                                                             |
| Billing tab deep link             | `/{locale}/{orgSlug}/settings?tab=billing` (also the user menu's "Billing")                                 |
| Pricing CTAs                      | Team card starts Checkout; signed-out visitors sign up first (`?redirect=/onboarding?subscribe=<interval>`) |
| Trial window and reminders        | `apps/copilot/lib/organization/trial-service.ts` (ADR 0021)                                                     |
| Manual override                   | `apps/control-tower/actions/organizations.ts`                                                               |

Plan resolution order (`apps/copilot/lib/organization/entitlements.ts`):
`Subscription.plan` first, then `organization.metadata.plan` — the field the
control tower writes and what a Stripe-less workspace still uses. An open Team
trial then upgrades a free organization to Team (ADR 0021). Every entitlement —
storage, seats, AI budget, permissions — resolves through that one function, so
billing cannot grant some limits but not others. Organizations created before
billing existed need no backfill.

Stripe never runs its own trial: the trial is card-less and lives on the
organization, so checkout charges the first invoice immediately.

## Configuration

Set these in `apps/copilot/.env`. On Kubernetes, `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` belong in the `asynchrone-space-copilot-secrets` Secret; the
rest are non-secret and go under `copilot.config` in `charts/asynchrone-space/values.yaml` (see
[deployment/helm.md](deployment/helm.md)):

| Variable                                                 | Purpose                                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`                                      | API key. Empty disables checkout and the portal but keeps the plan readable.                   |
| `STRIPE_WEBHOOK_SECRET`                                  | Signing secret of the endpoint below. Required for webhooks.                                   |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`                     | Reserved for Elements/embedded checkout; not needed for hosted Checkout.                       |
| `STRIPE_PRICE_TEAM_MONTHLY` / `STRIPE_PRICE_TEAM_YEARLY` | Optional Price IDs. When empty, Checkout receives the Team price inline (€12 / €120).          |
| `STRIPE_AUTOMATIC_TAX`                                   | `true` turns on Stripe Tax and requires a billing address. Needs a tax registration in Stripe. |

If `STRIPE_WEBHOOK_SECRET` is set without `STRIPE_SECRET_KEY` the app refuses to
boot (`lib/env.ts`).

## Test-mode procedure

1. Create a Stripe account, stay in **test mode**, and copy the test secret key
   into `STRIPE_SECRET_KEY`.

2. Install the Stripe CLI and forward webhooks to the app. Recent CLI versions
   require an explicit event selection (`--events`, `--all-snapshot` or
   `--all-thin`):

   ```bash
   stripe listen \
     --forward-to localhost:3000/api/webhooks/stripe \
     --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment.failed
   ```

   That list is exactly what the handler consumes. Use `--all-snapshot` to
   forward everything instead. **Do not use `--all-thin`**: thin events carry
   only a reference, and this endpoint parses snapshot payloads
   (`event.data.object`), so they would be ignored.

   `localhost:3000` is `npm run dev`; under `docker compose` the Copilot app is on
   `localhost:3003`. The port must match `BETTER_AUTH_URL` (or
   `NEXT_PUBLIC_APP_URL` when set), because the same origin is used for the
   Checkout success/cancel URLs.

   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`, then restart the
   app (`npm run dev`, or `docker compose up -d web` to recreate the container
   so it picks up the new env value).

3. Sign in, open a workspace, go to **Settings → Billing** and click
   **Monthly — €12**. Pay with `4242 4242 4242 4242`, any future expiry and any
   CVC. Yearly uses the same form.

4. Verify the plan flipped without touching the database:

   ```bash
   psql "$DATABASE_URL" -c 'select "organizationId", plan, status, "billingInterval", "currentPeriodEnd" from subscription;'
   ```

   Expect `plan = team`, `status = active` once Stripe has collected the test
   card. Stripe never grants its own trial: the Team trial is a card-less
   window on the organization ([ADR 0021](adr/0021-team-trial-without-billing.md)),
   so checkout always charges the first invoice.

5. Replay an event to confirm idempotency. `stripe listen` prints event ids:

   ```bash
   stripe events resend evt_…
   ```

   The response is `{"received":true,"outcome":"duplicate"}` and nothing
   changes. The same command is what recovers a delivery the handler failed on:
   a `failed` row (or one stuck in `processing` for over ten minutes) is claimed
   again, so a transient provider or database error is retried rather than
   lost. `billingEvent` has one row per event id.

6. Exercise the lifecycle:

   | Scenario             | Stripe CLI                                                 | Expected                                                |
   | -------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
   | Cancel at period end | `stripe subscriptions update sub_… --cancel-at-period-end` | `cancelAtPeriodEnd = true`, plan stays `team`           |
   | End the period early | `stripe subscriptions cancel sub_…`                        | `status = canceled`, plan `free`, data intact           |
   | Failed payment       | `stripe trigger invoice.payment_failed`                    | `status = past_due`, plan stays `team`, owners notified |
   | Paid invoice         | `stripe trigger invoice.paid`                              | invoice row `paid`, `paidAt` set                        |

7. Open **Manage subscription** to confirm the Customer Portal loads (payment
   methods, switches, invoice downloads).

8. Check the invoice table on the Billing tab. Stripe _generates_ invoices; Asynchrone
   only mirrors them. `invoice.paid` writes the row, and if that delivery was
   missed the settings page reconciles once from the provider (the local
   `invoice` table is empty for a customer that has invoices), so the list is
   correct even before the webhook lands. Confirm no card data reached Asynchrone:
   `invoice` stores only ids, amounts, currency and hosted links;
   `billingEvent` stores the event id and type.

9. Confirm webhooks are actually arriving — `billingEvent` is empty when
   `stripe listen` was not running, or forwards to the wrong port:

   ```bash
   node -e '…select \"eventId\",type,status from \"billingEvent\"…'
   ```

   `stripe listen` prints one line per delivery (`checkout.session.completed
[200]`). No lines means nothing reached the app; check the forwarded URL
   (3000 for `npm run dev`, 3003 for `docker compose`).

## Production checklist

- Register the endpoint `https://<app-host>/api/webhooks/stripe` for
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid` and `invoice.payment_failed`.
- Enable the Customer Portal in Stripe with cancellation and plan switching
  allowed; the app never edits subscriptions itself.
- Configure tax registrations before setting `STRIPE_AUTOMATIC_TAX=true`.
- Keep `CRON_SECRET` set so `asynchrone-space-copilot-trial-expiry` (daily 06:00)
  can run the trial reminders and expiry.
- Do not reuse test keys in production, and never commit either key.

## Manual overrides and Enterprise

The control tower can grant any plan (Plan & quota card on an organization).
Saving writes `Subscription` with `provider = "manual"` and
`manualOverride = true` — for every plan, so a manual downgrade to Starter is
not undone by the next webhook. Webhooks then leave the plan alone; each change
appends a `PlatformAuditEvent` (`organization.plan.update`).

**Release override** clears the flag and hands the plan back to the provider on
the next webhook without changing the current plan in the meantime. Releasing
is audited as `organization.plan.release`.

## Purchase entry points

The Team card on `/pricing` (and the home page preview) is the only place that
sells a plan. What a click does depends on the visitor:

| Visitor                             | Click action                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Signed out                          | `/sign-up?redirect=/onboarding?subscribe=<interval>` — account first, then a workspace, then checkout |
| Signed in, no workspace             | `/onboarding?subscribe=<interval>` — workspace first, then checkout                                   |
| Signed in, workspace on Starter     | Creates the Stripe Checkout session immediately and redirects to Stripe                               |
| Signed in, workspace already paying | "Manage plan" → `/{orgSlug}/settings?tab=billing` (no second checkout)                                |

The `subscribe` intent is carried through onboarding; the billing panel starts
the checkout as soon as it resolves the plan, so a new customer lands on
Stripe's payment page without an extra click. The intent is dropped if checkout
cannot start (no keys, plan already paid, role without permission), which sends
the visitor to the billing tab instead.

## Known limits

- Usage-based metering, revenue recognition, accounting exports, filing VAT
  returns and non-Stripe currencies are out of scope.
- Downgrading keeps rows and files; writes that exceed the new storage quota
  are rejected by the existing quota checks (`packages/files/src/storage.ts`, bound in `apps/copilot/lib/files.ts`). Other
  feature limits belong to the entitlement layer.
