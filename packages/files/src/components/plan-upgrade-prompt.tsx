"use client"

import { useTranslations } from "next-intl"

import { Link } from "@workspace/i18n/navigation"
import { useEntitlements } from "@workspace/organization/use-entitlements"
import { Button } from "@workspace/ui/components/button"
import { UpgradePrompt } from "@workspace/ui/components/upgrade-prompt"

/** Upgrade hint shown where a files feature needs a higher plan. */
export function PlanUpgradePrompt({
  feature,
  className,
}: {
  feature: "granularPermissions"
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
