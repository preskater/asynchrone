"use client"

import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import { UpgradePrompt } from "@workspace/ui/components/upgrade-prompt"

import { Link } from "@workspace/i18n/navigation"
import { useEntitlements } from "@/lib/organization/use-entitlements"

export function PlanUpgradePrompt({
  feature,
  className,
}: {
  feature:
    | "ai"
    | "aiQuota"
    | "auditLog"
    | "granularPermissions"
    | "requireTwoFactor"
    | "seats"
  className?: string
}) {
  const t = useTranslations("Common.upgrade")
  const { entitlements } = useEntitlements()
  return (
    <UpgradePrompt
      className={className}
      title={t("title")}
      description={t(feature, { seats: entitlements.seats })}
      action={
        // ponytail: links to the public pricing page until a billing page exists.
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/pricing" />}
        >
          {t("cta")}
        </Button>
      }
    />
  )
}
