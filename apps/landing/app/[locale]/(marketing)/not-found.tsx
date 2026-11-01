import { getTranslations } from "next-intl/server"
import { CompassIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

export default async function MarketingNotFound() {
  const t = await getTranslations("Marketing.notFound")
  return (
    <NotFoundState
      icon={CompassIcon}
      title={t("title")}
      description={t("description")}
      className="min-h-[70svh]"
      actions={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("backHome")}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/blog" />}
          >
            {t("readBlog")}
          </Button>
        </div>
      }
    />
  )
}
