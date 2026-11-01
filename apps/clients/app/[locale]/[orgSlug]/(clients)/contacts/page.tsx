import { getTranslations } from "next-intl/server"

import { ContactsPanel } from "@workspace/clients/components/contacts-panel"

import { clientsService } from "@/lib/clients"
import { getPageContext } from "@/lib/request-context"

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getPageContext()

  const [data, t] = await Promise.all([
    clientsService.getOverview(ctx),
    getTranslations("AppPages"),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("contactsTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("contactsDescription")}
        </p>
      </div>
      <ContactsPanel orgSlug={orgSlug} data={data} />
    </div>
  )
}
