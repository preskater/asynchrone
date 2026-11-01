import { getTranslations } from "next-intl/server"
import { CalendarCogIcon } from "lucide-react"

import { appUrl } from "@workspace/contracts/server"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

import { MeetingSettingsForm } from "@/components/meetings/meeting-settings-form"

/**
 * Organization meeting settings on the calendars host.
 *
 * Meeting settings moved with calendars (#161): the booking window, duration
 * limits and the meeting provider belong to the domain that owns the events.
 * Copilot's organization settings link here instead of embedding the form.
 */
export default async function CalendarSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>
}) {
  const { locale, orgSlug } = await params
  const t = await getTranslations("MeetingRequests")

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarCogIcon className="size-4" />
            {t("settingsTitle")}
          </h2>
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link
              href={appUrl("copilot", {
                locale,
                orgSlug,
                path: "/settings",
              })}
            />
          }
        >
          {t("backToSettings")}
        </Button>
      </div>
      <MeetingSettingsForm />
    </div>
  )
}
