import { getTranslations } from "next-intl/server"
import { CalendarXIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

import { getActiveOrgSlug } from "@/lib/organization/paths"

export default async function CalendarsNotFound() {
  const t = await getTranslations("AppPages")
  const orgSlug = await getActiveOrgSlug()
  const calendarsHref = orgSlug ? `/${orgSlug}/calendars` : "/onboarding"

  return (
    <NotFoundState
      icon={CalendarXIcon}
      title={t("calendarNotFoundTitle")}
      description={t("calendarNotFoundDescription")}
      actions={
        <Button nativeButton={false} render={<Link href={calendarsHref} />}>
          {t("backToCalendars")}
        </Button>
      }
    />
  )
}
