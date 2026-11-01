import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { ClientDetail } from "@workspace/clients/components/client-detail"
import { isAppError } from "@workspace/core/errors"

import { clientsService } from "@/lib/clients"
import { getPortalAccess } from "@/lib/portal-access"
import { getRequestContext } from "@/lib/request-context"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string }>
}) {
  const { orgSlug, clientId } = await params
  const ctx = await getRequestContext()

  let data
  try {
    data = await clientsService.getClientDetail(ctx, clientId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      notFound()
    }
    throw error
  }

  const portal = data.access.canEdit
    ? await getPortalAccess(ctx.organizationId, clientId)
    : { members: [], invites: [] }

  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("clientsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("clientsDescription")}
        </p>
      </div>
      <ClientDetail
        orgSlug={orgSlug}
        data={data}
        portal={portal}
        // Invitations are created by Copilot's Better Auth instance (#171).
        portalManage={false}
      />
    </div>
  )
}
