import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { ContactDetail } from "@workspace/clients/components/contact-detail"
import { isAppError } from "@workspace/core/errors"

import { clientsService } from "@/lib/clients"
import { getRequestContext } from "@/lib/request-context"

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; contactId: string }>
}) {
  const { orgSlug, contactId } = await params
  const ctx = await getRequestContext()

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
