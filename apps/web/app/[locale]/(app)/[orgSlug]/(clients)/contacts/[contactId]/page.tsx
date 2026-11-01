import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { ContactDetail } from "@workspace/clients/components/contact-detail"

import { auth } from "@/lib/auth"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { isAppError } from "@workspace/core/errors"
import { clientsService } from "@/lib/clients"
import { prisma } from "@/lib/prisma"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; contactId: string }>
}) {
  const { orgSlug, contactId } = await params

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
    data = await clientsService.getContactDetail(ctx, contactId)
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
        <h2 className="text-lg font-semibold">{t("contactsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("contactsDescription")}
        </p>
      </div>
      <ContactDetail orgSlug={orgSlug} data={data} />
    </div>
  )
}
