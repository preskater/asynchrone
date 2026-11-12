import { getTranslations } from "next-intl/server"

import { FeedbackBoard } from "@workspace/clients/components/feedback"
import { appOrigin } from "@workspace/contracts/server"

import { clientsService } from "@/lib/clients"
import { getPageContext } from "@/lib/request-context"

export default async function FeedbackTriagePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const ctx = await getPageContext()

  const [data, t] = await Promise.all([
    clientsService.getFeedbackPage(ctx),
    getTranslations("Clients"),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("feedback.crossTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("feedback.crossDescription")}
        </p>
      </div>
      <FeedbackBoard
        orgSlug={orgSlug}
        groups={data.groups}
        access={data.access}
        projectsUrl={appOrigin("projects")}
        members={data.members}
      />
    </div>
  )
}
