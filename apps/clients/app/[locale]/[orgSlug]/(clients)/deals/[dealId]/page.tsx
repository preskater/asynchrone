import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { DealDetail } from "@workspace/clients/components/deal-detail"
import { isAppError } from "@workspace/core/errors"

import { clientsService } from "@/lib/clients"
import { getPageContext } from "@/lib/request-context"

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; dealId: string }>
}) {
  const { orgSlug, dealId } = await params
  const ctx = await getPageContext()

  let data
  try {
    data = await clientsService.getDealDetail(ctx, dealId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      notFound()
    }
    throw error
  }
  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("dealsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("dealsDescription")}</p>
      </div>
      <DealDetail orgSlug={orgSlug} data={data} />
    </div>
  )
}
