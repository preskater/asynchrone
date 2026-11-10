"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import {
  releaseOrganizationPlanOverride,
  updateOrganizationPlan,
} from "@/actions/organizations"

const MB = 1024 * 1024

const PLANS = ["free", "team", "enterprise"] as const
type Plan = (typeof PLANS)[number]

export interface SubscriptionSummary {
  status: string
  provider: string
  billingInterval: string | null
  currentPeriodEnd: Date | null
  trialEndsAt: Date | null
  cancelAtPeriodEnd: boolean
  manualOverride: boolean
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  updatedAt: Date
}

function formatDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "—"
}

function BillingState({ subscription }: { subscription: SubscriptionSummary }) {
  const renewal = subscription.cancelAtPeriodEnd
    ? `cancels ${formatDate(subscription.currentPeriodEnd)}`
    : subscription.trialEndsAt
      ? `trial ends ${formatDate(subscription.trialEndsAt)}`
      : subscription.currentPeriodEnd
        ? `renews ${formatDate(subscription.currentPeriodEnd)}`
        : "no renewal scheduled"

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <dt>Provider</dt>
      <dd className="font-mono">{subscription.provider}</dd>
      <dt>Status</dt>
      <dd className="font-mono">{subscription.status}</dd>
      <dt>Interval</dt>
      <dd className="font-mono">{subscription.billingInterval ?? "—"}</dd>
      <dt>Renewal</dt>
      <dd>{renewal}</dd>
      <dt>Customer</dt>
      <dd className="truncate font-mono">
        {subscription.providerCustomerId ?? "—"}
      </dd>
      <dt>Subscription</dt>
      <dd className="truncate font-mono">
        {subscription.providerSubscriptionId ?? "—"}
      </dd>
      <dt>Override</dt>
      <dd>
        {subscription.manualOverride ? "manual (webhooks ignored)" : "no"}
      </dd>
    </dl>
  )
}

export function PlanForm({
  organizationId,
  plan,
  quotaBytes,
  subscription,
}: {
  organizationId: string
  plan: Plan
  quotaBytes: number | null
  subscription?: SubscriptionSummary | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [releasing, startRelease] = useTransition()
  const [nextPlan, setNextPlan] = useState<Plan>(plan)
  const [quotaMb, setQuotaMb] = useState(
    quotaBytes ? String(Math.round(quotaBytes / MB)) : ""
  )
  const [error, setError] = useState<string | null>(null)

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const parsedMb = quotaMb.trim() === "" ? null : Number(quotaMb)
    if (parsedMb !== null && (!Number.isFinite(parsedMb) || parsedMb <= 0)) {
      setError(
        "Quota must be a positive number of MB, or empty for the plan default."
      )
      return
    }

    startTransition(async () => {
      const result = await updateOrganizationPlan({
        organizationId,
        plan: nextPlan,
        quotaBytes: parsedMb === null ? null : Math.round(parsedMb * MB),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Plan updated.")
      router.refresh()
    })
  }

  function release() {
    startRelease(async () => {
      const result = await releaseOrganizationPlanOverride({ organizationId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Plan released to the payment provider.")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {subscription ? <BillingState subscription={subscription} /> : null}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Plan
            <select
              value={nextPlan}
              onChange={(event) => setNextPlan(event.target.value as Plan)}
              className="h-8 rounded-lg border border-input-border bg-background px-2 text-sm text-foreground capitalize"
            >
              {PLANS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Quota override (MB)
            <Input
              inputMode="numeric"
              value={quotaMb}
              onChange={(event) => setQuotaMb(event.target.value)}
              placeholder="Plan default"
              className="w-40"
            />
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {subscription?.manualOverride ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={releasing}
              onClick={release}
            >
              {releasing ? "Releasing…" : "Release override"}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Saving a plan writes a manual override: the payment provider will no
          longer change it until you release it. Every change is audited.
        </p>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
