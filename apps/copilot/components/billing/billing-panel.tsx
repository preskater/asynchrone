"use client"

import * as React from "react"
import {
  CreditCardIcon,
  ExternalLinkIcon,
  ReceiptTextIcon,
  SparklesIcon,
} from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  createCheckoutSessionAction,
  createPortalSessionAction,
  getBillingOverviewAction,
  syncCheckoutSessionAction,
} from "@/actions/billing"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  BillingInterval,
  BillingOverviewData,
  InvoiceSummaryData,
  SubscriptionStatus,
} from "@/lib/billing/types"
import { formatBytes } from "@workspace/files/file-utils"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useOrgPermissions } from "@/lib/organization/use-permissions"

export interface CheckoutReturn {
  status: "success" | "cancelled"
  sessionId: string | null
}

const STATUS_KEYS = {
  active: "statusActive",
  trialing: "statusTrialing",
  past_due: "statusPastDue",
  canceled: "statusCanceled",
  inactive: "statusInactive",
  unpaid: "statusUnpaid",
} as const satisfies Record<SubscriptionStatus, string>

const INVOICE_STATUS_KEYS = {
  draft: "invoiceStatusDraft",
  open: "invoiceStatusOpen",
  paid: "invoiceStatusPaid",
  void: "invoiceStatusVoid",
  uncollectible: "invoiceStatusUncollectible",
} as const

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" })
}

function formatAmount(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

const PLAN_KEYS = {
  free: "planFree",
  team: "planTeam",
  enterprise: "planEnterprise",
} as const

const PLAN_DESCRIPTION_KEYS = {
  free: "planFreeDescription",
  team: "planTeamDescription",
  enterprise: "planEnterpriseDescription",
} as const

/**
 * Settings → Billing. Reads the subscription through a server action so the
 * page never needs provider credentials on the client; upgrades and the
 * customer portal both leave the app through a provider-hosted URL.
 */
export function BillingPanel({ checkout }: { checkout?: CheckoutReturn }) {
  const t = useTranslations("Billing")
  const te = useErrorTranslator()
  const locale = useLocale()
  const router = useRouter()
  const params = useParams<{ orgSlug: string }>()
  const searchParams = useSearchParams()
  const permissions = useOrgPermissions()
  // Set when the visitor clicked "Get Team" on the pricing page.
  const subscribeIntent = searchParams.get("subscribe")
  const autoInterval: BillingInterval | null =
    subscribeIntent === "month" || subscribeIntent === "year"
      ? subscribeIntent
      : null
  const autoStarted = React.useRef(false)
  const [overview, setOverview] = React.useState<BillingOverviewData>()
  const [loading, setLoading] = React.useState(true)
  const [pending, setPending] = React.useState<string | null>(null)

  const canManage = permissions.can("billing:manage")

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const data =
          checkout?.status === "success" && checkout.sessionId
            ? unwrapActionResult(
                await syncCheckoutSessionAction({
                  sessionId: checkout.sessionId,
                })
              )
            : unwrapActionResult(await getBillingOverviewAction())
        if (cancelled) return
        setOverview(data)
        if (checkout?.status === "success") {
          toast.success(t("checkoutSuccess"))
        } else if (checkout?.status === "cancelled") {
          toast.info(t("checkoutCancelled"))
        }
        // Drop the provider return parameters (and keep the billing tab) so a
        // refresh does not replay the sync or re-toast.
        if (checkout?.status && params.orgSlug) {
          router.replace({
            pathname: `/${params.orgSlug}/settings`,
            query: { tab: "billing" },
          })
        }
      } catch (error) {
        if (!cancelled) toast.error(te(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkout?.status, checkout?.sessionId, params.orgSlug, router, t, te])

  /** Drops the `subscribe` intent so a reload does not retry the checkout. */
  function clearSubscribeIntent() {
    if (!params.orgSlug) return
    router.replace({
      pathname: `/${params.orgSlug}/settings`,
      query: { tab: "billing" },
    })
  }

  async function redirect(
    target: "checkout" | "portal",
    interval?: BillingInterval
  ) {
    setPending(interval ? `${target}:${interval}` : target)
    try {
      const result =
        target === "checkout" && interval
          ? unwrapActionResult(
              await createCheckoutSessionAction({ interval, locale })
            )
          : unwrapActionResult(await createPortalSessionAction({ locale }))
      window.location.assign(result.url)
    } catch (error) {
      toast.error(te(error))
      setPending(null)
      if (autoInterval) clearSubscribeIntent()
    }
  }

  React.useEffect(() => {
    if (!overview || !autoInterval || autoStarted.current) return
    autoStarted.current = true
    if (overview.plan !== "free" || !overview.canSubscribe) {
      clearSubscribeIntent()
      return
    }
    void redirect("checkout", autoInterval)
    // Only the resolved overview should trigger this, once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, autoInterval])

  if (loading || !overview) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  const { usage } = overview
  const usagePercent =
    usage.storageQuotaBytes > 0
      ? Math.min(
          100,
          Math.round((usage.storageUsedBytes / usage.storageQuotaBytes) * 100)
        )
      : 0
  // Amounts come from the server catalog so the copy can never drift from the
  // charge; the yearly fallback covers a manually granted plan with no interval.
  const priceFor = (interval: BillingInterval) =>
    formatAmount(
      overview.prices[interval].amount,
      overview.prices[interval].currency,
      locale
    )

  const periodNote = overview.cancelAtPeriodEnd
    ? t("cancelsOn", { date: formatDate(overview.currentPeriodEnd, locale) })
    : overview.trialEndsAt
      ? t("trialingNote", { date: formatDate(overview.trialEndsAt, locale) })
      : overview.currentPeriodEnd
        ? t("renewsOn", {
            date: formatDate(overview.currentPeriodEnd, locale),
            price: priceFor(overview.interval ?? "month"),
          })
        : t("noRenewal")

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4" />
                {t("currentPlan")}
              </CardTitle>
              <CardDescription>
                {t(PLAN_DESCRIPTION_KEYS[overview.plan])}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t(PLAN_KEYS[overview.plan])}</Badge>
              <Badge variant="outline">{t(STATUS_KEYS[overview.status])}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {overview.manualOverride ? t("manualOverrideNote") : periodNote}
          </p>

          {canManage && overview.plan === "free" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{t("upgradeTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("upgradeDescription")}
                </p>
              </div>
              {!overview.canSubscribe ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {t("billingDisabledNote")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={pending !== null || !overview.canSubscribe}
                  onClick={() => void redirect("checkout", "month")}
                >
                  <CreditCardIcon />
                  {pending === "checkout:month"
                    ? t("redirecting")
                    : t("upgradeMonthly", { price: priceFor("month") })}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending !== null || !overview.canSubscribe}
                  onClick={() => void redirect("checkout", "year")}
                >
                  {pending === "checkout:year"
                    ? t("redirecting")
                    : t("upgradeYearly", { price: priceFor("year") })}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("yearlyHint")}</p>
            </div>
          ) : null}

          {canManage &&
          overview.plan !== "free" &&
          overview.provider === "stripe" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{t("manageTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {overview.canManagePayment
                    ? t("manageDescription")
                    : t("portalUnavailable")}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null || !overview.canManagePayment}
                onClick={() => void redirect("portal")}
              >
                <ExternalLinkIcon />
                {pending === "portal" ? t("redirecting") : t("managePayment")}
              </Button>
            </div>
          ) : null}

          {overview.plan === "enterprise" ? (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-medium">{t("enterpriseTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("enterpriseDescription")}
              </p>
            </div>
          ) : null}

          {!canManage ? (
            <p className="text-xs text-muted-foreground">{t("readOnlyNote")}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("usageTitle")}</CardTitle>
          <CardDescription>{t("usageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Progress value={usagePercent} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t("usageValue", {
                used: formatBytes(usage.storageUsedBytes),
                quota: formatBytes(usage.storageQuotaBytes),
              })}
            </span>
            <span>{usagePercent}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptTextIcon className="size-4" />
            {t("invoicesTitle")}
          </CardTitle>
          <CardDescription>{t("invoicesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {overview.invoices.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">
              {t("invoicesEmpty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoiceNumber")}</TableHead>
                  <TableHead>{t("invoiceDate")}</TableHead>
                  <TableHead>{t("invoiceAmount")}</TableHead>
                  <TableHead>{t("invoiceStatus")}</TableHead>
                  <TableHead className="text-end">
                    {t("invoiceAction")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.invoices.map((invoice: InvoiceSummaryData) => {
                  const statusKey =
                    invoice.status in INVOICE_STATUS_KEYS
                      ? INVOICE_STATUS_KEYS[
                          invoice.status as keyof typeof INVOICE_STATUS_KEYS
                        ]
                      : null
                  const href = invoice.hostedInvoiceUrl ?? invoice.invoicePdf
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-xs">
                        {invoice.number ?? invoice.id}
                      </TableCell>
                      <TableCell>
                        {formatDate(invoice.createdAt, locale)}
                      </TableCell>
                      <TableCell>
                        {formatAmount(
                          invoice.amountPaid || invoice.amountDue,
                          invoice.currency,
                          locale
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {statusKey ? t(statusKey) : invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end">
                        {href ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            nativeButton={false}
                            render={
                              <a href={href} target="_blank" rel="noreferrer" />
                            }
                          >
                            {t("invoiceView")}
                            <ExternalLinkIcon />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
