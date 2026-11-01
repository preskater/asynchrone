import { getTranslations } from "next-intl/server"
import { FileQuestionIcon } from "lucide-react"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"

export default async function BlogPostNotFound() {
  const t = await getTranslations("Marketing.blog")
  return (
    <NotFoundState
      icon={FileQuestionIcon}
      title={t("notFoundTitle")}
      description={t("notFoundDescription")}
      className="min-h-[70svh]"
      actions={
        <Button nativeButton={false} render={<Link href="/blog" />}>
          {t("backToPosts")}
        </Button>
      }
    />
  )
}
