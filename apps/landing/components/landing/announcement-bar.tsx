import { ArrowRightIcon, SparklesIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Link } from "@workspace/i18n/navigation"

export function AnnouncementBar() {
  const t = useTranslations("Announcement")

  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-6 py-2 text-center text-sm">
        <SparklesIcon className="size-4 shrink-0" />
        <span>{t("message")}</span>
        <Link
          href="/blog/ai-native-workflows"
          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
        >
          {t("cta")}
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
