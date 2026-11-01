import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { DealsWorkspace } from "@workspace/clients/components/deals-workspace"

import { auth } from "@/lib/auth"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { clientsService } from "@/lib/clients"
import { prisma } from "@/lib/prisma"

export default async function DealsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

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
  const [data, t] = await Promise.all([
    clientsService.getOverview(ctx),
    getTranslations("AppPages"),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("dealsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("dealsDescription")}</p>
      </div>
      <DealsWorkspace orgSlug={orgSlug} data={data} />
    </div>
  )
}
