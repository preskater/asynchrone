"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ShieldCheckIcon } from "lucide-react"
import { toast } from "sonner"

import { setTwoFactorRequiredAction } from "@/actions/two-factor-policy"
import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEntitlements } from "@/lib/organization/use-entitlements"

export interface TwoFactorPolicy {
  required: boolean
  missing: { id: string; name: string; email: string }[]
}

export function TwoFactorPolicyCard({ policy }: { policy: TwoFactorPolicy }) {
  const t = useTranslations("Org.twoFactorPolicy")
  const te = useErrorTranslator()
  const router = useRouter()
  const entitled = useEntitlements().can("requireTwoFactor")
  const [pending, setPending] = React.useState(false)

  async function toggle(required: boolean) {
    setPending(true)
    try {
      unwrapActionResult(await setTwoFactorRequiredAction(required))
      toast.success(required ? t("enabled") : t("disabled"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* An org downgraded with the policy on can still turn it off. */}
        {entitled || policy.required ? (
          <Field orientation="horizontal">
            <Checkbox
              id="org-require-two-factor"
              checked={policy.required}
              disabled={pending}
              onCheckedChange={(checked) => toggle(checked === true)}
            />
            <FieldLabel htmlFor="org-require-two-factor">
              {t("require")}
            </FieldLabel>
          </Field>
        ) : null}
        {entitled ? null : <PlanUpgradePrompt feature="requireTwoFactor" />}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("missingTitle", { count: policy.missing.length })}
          </p>
          {policy.missing.length === 0 ? (
            <FieldDescription>{t("allEnrolled")}</FieldDescription>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {policy.missing.map((user) => (
                <li key={user.id} className="flex flex-wrap gap-x-2 p-2">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-muted-foreground">{user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
