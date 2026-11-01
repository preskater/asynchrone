import { getTranslations } from "next-intl/server"
import { FolderXIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

import { getActiveOrgSlug } from "@/lib/organization/paths"

export default async function ProjectNotFound() {
  const t = await getTranslations("AppPages")
  const orgSlug = await getActiveOrgSlug()
  const projectsHref = orgSlug ? `/${orgSlug}/projects` : "/onboarding"

  return (
    <NotFoundState
      icon={FolderXIcon}
      title={t("projectNotFoundTitle")}
      description={t("projectNotFoundDescription")}
      actions={
        <Button nativeButton={false} render={<Link href={projectsHref} />}>
          {t("backToProjects")}
        </Button>
      }
    />
  )
}
