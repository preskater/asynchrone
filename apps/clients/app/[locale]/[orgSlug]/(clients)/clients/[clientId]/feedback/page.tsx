import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeftIcon } from "lucide-react"

import { FeedbackBoard } from "@workspace/clients/components/feedback"
import { appOrigin } from "@workspace/contracts/server"
import { isAppError } from "@workspace/core/errors"
import { Link } from "@workspace/i18n/navigation"

import { clientsService } from "@/lib/clients"
import { getPageContext } from "@/lib/request-context"

export default async function ClientFeedbackPage({
  params,
}: {
  params: Promise<{ orgSlug: string; clientId: string }>
}) {
  const { orgSlug, clientId } = await params
  const ctx = await getPageContext()

  let detail
  try {
    detail = await clientsService.getClientDetail(ctx, clientId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound()
    throw error
  }
  const [groups, t] = await Promise.all([
    clientsService.listReleaseGroups(ctx, { clientId }),
    getTranslations("Clients"),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link
          href={`/${orgSlug}/clients/${clientId}`}
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          {detail.client.name}
        </Link>
        <h2 className="text-lg font-semibold">{t("feedback.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("feedback.description", { name: detail.client.name })}
        </p>
      </div>
      <FeedbackBoard
        orgSlug={orgSlug}
        groups={groups}
        access={detail.access}
        projectsUrl={appOrigin("projects")}
        members={detail.members}
        client={{
          id: detail.client.id,
          name: detail.client.name,
          contacts: detail.contacts,
          projects: detail.projects,
        }}
      />
    </div>
  )
}
