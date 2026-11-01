import { getTranslations } from "next-intl/server"
import { CompassIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

import { getActiveOrgSlug } from "@/lib/organization/paths"

export default async function OrganizationNotFound() {
  const t = await getTranslations("AppPages")
  const orgSlug = await getActiveOrgSlug()
  const dashboardHref = orgSlug ? `/${orgSlug}` : "/onboarding"

  return (
    <NotFoundState
      icon={CompassIcon}
      title={t("pageNotFoundTitle")}
      description={t("pageNotFoundDescription")}
      actions={
        <Button nativeButton={false} render={<Link href={dashboardHref} />}>
          {t("backToDashboard")}
        </Button>
      }
    />
  )
}
