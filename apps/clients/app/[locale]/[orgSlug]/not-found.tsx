import { getTranslations } from "next-intl/server"
import { CompassIcon } from "lucide-react"

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

/**
 * Not-found boundary for the CRM screens.
 *
 * A record id from another organization (or a deleted one) must answer "not
 * found" without rendering any of its data; the detail pages call
 * `notFound()` after the organization-scoped lookup fails, so this is the UI
 * that replaces the shell's content.
 */
export default async function ClientNotFound() {
  const t = await getTranslations("NotFound")

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CompassIcon />
          </EmptyMedia>
          <EmptyTitle>{t("title")}</EmptyTitle>
          <EmptyDescription>{t("description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("backHome")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
