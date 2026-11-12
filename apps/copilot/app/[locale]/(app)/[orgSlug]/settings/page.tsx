import { getTranslations } from "next-intl/server"

import { appOrigin } from "@workspace/contracts/server"

import type { CheckoutReturn } from "@/components/billing/billing-panel"
import { DataExportCard } from "@/components/organization/data-export-card"
import { ExternalCollaborators } from "@/components/organization/external-collaborators"
import { OrganizationSettings } from "@/components/organization/organization-settings"
import { TrialCard } from "@/components/trial/trial-card"

import { can } from "@workspace/core/roles"

import { getOptionalRequestContext } from "@/lib/core/auth-context"
import { guestService, listShareableProjects } from "@/lib/guests"
import { getOrganizationEntitlements } from "@/lib/organization/entitlements"
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
  // External collaborators: owners and admins only (ADR 0041).
  let guestsCard: React.ReactNode = null
  if (ctx && can(ctx, "member:manage")) {
    const { externalCollaborators: limit } = await getOrganizationEntitlements(
      ctx.organizationId
    )
    const [guests, projects] =
      limit > 0
        ? await Promise.all([
            guestService.list(ctx),
            listShareableProjects(ctx).catch(() => []),
          ])
        : [[], []]
    guestsCard = (
      <ExternalCollaborators
        guests={guests}
        projects={projects}
        limit={limit}
      />
    )
  }
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("settingsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settingsDescription")}
        </p>
      </div>
      <TrialCard />
      {/* Meeting settings moved with calendars (#161); the tab links there. */}
      <OrganizationSettings
        checkout={checkout}
        deletionScheduledAt={deletionScheduledAt}
        twoFactorPolicy={twoFactorPolicy}
        exportCard={<DataExportCard />}
        guestsCard={guestsCard}
        calendarsUrl={appOrigin("calendars")}
      />
    </div>
  )
}
