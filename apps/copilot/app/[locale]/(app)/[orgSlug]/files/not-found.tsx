import { getTranslations } from "next-intl/server"
import { FileXIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

import { getActiveOrgSlug } from "@/lib/organization/paths"

export default async function FilesNotFound() {
  const t = await getTranslations("AppPages")
  const orgSlug = await getActiveOrgSlug()
  const filesHref = orgSlug ? `/${orgSlug}/files` : "/onboarding"

  return (
    <NotFoundState
      icon={FileXIcon}
      title={t("fileNotFoundTitle")}
      description={t("fileNotFoundDescription")}
      actions={
        <Button nativeButton={false} render={<Link href={filesHref} />}>
          {t("backToFiles")}
        </Button>
      }
    />
  )
}
