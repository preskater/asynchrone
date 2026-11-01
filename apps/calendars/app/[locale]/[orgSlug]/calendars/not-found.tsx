import { CalendarXIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

export default async function CalendarsNotFound() {
  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarXIcon />
          </EmptyMedia>
          <EmptyTitle>{t("calendarNotFoundTitle")}</EmptyTitle>
          <EmptyDescription>
            {t("calendarNotFoundDescription")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            nativeButton={false}
            render={<Link href="/" prefetch={false} />}
          >
            {t("backToCalendars")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
