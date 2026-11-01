import { getTranslations } from "next-intl/server"
import { MessageSquareXIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

import { getActiveOrgSlug } from "@/lib/organization/paths"

export default async function MessagesNotFound() {
  const t = await getTranslations("AppPages")
  const orgSlug = await getActiveOrgSlug()
  const messagesHref = orgSlug ? `/${orgSlug}/messages` : "/onboarding"

  return (
    <NotFoundState
      icon={MessageSquareXIcon}
      title={t("conversationNotFoundTitle")}
      description={t("conversationNotFoundDescription")}
      actions={
        <Button nativeButton={false} render={<Link href={messagesHref} />}>
          {t("backToMessages")}
        </Button>
      }
    />
  )
}
