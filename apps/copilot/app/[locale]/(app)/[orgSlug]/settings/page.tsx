import { getTranslations } from "next-intl/server"

import type { CheckoutReturn } from "@/components/billing/billing-panel"
import { DataExportCard } from "@/components/organization/data-export-card"
import { OrganizationSettings } from "@/components/organization/organization-settings"
import { TrialCard } from "@/components/trial/trial-card"

import { getOptionalRequestContext } from "@/lib/core/auth-context"
import { getDeletionScheduledAt } from "@/lib/organization/deletion-service"
import { getTwoFactorPolicy } from "@/lib/organization/two-factor-policy"

function checkoutFrom(
  params: Record<string, string | string[] | undefined>
): CheckoutReturn | undefined {
  const status = params.checkout
  if (status !== "success" && status !== "cancelled") return undefined
  const sessionId =
    typeof params.session_id === "string" ? params.session_id : null
  return { status, sessionId }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations("AppPages")
  const checkout = checkoutFrom(await searchParams)
  const ctx = await getOptionalRequestContext()
  const [deletionScheduledAt, twoFactorPolicy] = ctx
    ? await Promise.all([
        getDeletionScheduledAt(ctx.organizationId),
        getTwoFactorPolicy(ctx),
      ])
    : [null, null]
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("settingsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settingsDescription")}
        </p>
      </div>
      <TrialCard />
      <OrganizationSettings
        checkout={checkout}
        deletionScheduledAt={deletionScheduledAt}
        twoFactorPolicy={twoFactorPolicy}
        exportCard={<DataExportCard />}
      />
    </div>
  )
}
