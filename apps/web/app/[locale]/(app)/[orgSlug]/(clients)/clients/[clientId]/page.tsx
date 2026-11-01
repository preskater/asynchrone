import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { ClientDetail } from "@workspace/clients/components/client-detail"

import { auth } from "@/lib/auth"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { isAppError } from "@workspace/core/errors"
import { clientsService } from "@/lib/clients"
import { portalService } from "@/lib/portal"
import type { PortalAccessData } from "@/lib/portal/types"
import { prisma } from "@/lib/prisma"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string }>
}) {
  const { orgSlug, clientId } = await params

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/sign-in")
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  })

  if (!organization) {
    notFound()
  }

  const ctx = await getRequestContextForOrganization(organization.id)

  let data
  try {
    data = await clientsService.getClientDetail(ctx, clientId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      notFound()
    }
    throw error
  }

  let portal: PortalAccessData = { members: [], invites: [] }
  if (data.access.canEdit) {
    portal = await portalService.listAccess(ctx, clientId)
  }

  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("clientsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("clientsDescription")}</p>
      </div>
      <ClientDetail orgSlug={orgSlug} data={data} portal={portal} />
    </div>
  )
}
