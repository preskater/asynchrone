import { getTranslations } from "next-intl/server"
import { FolderXIcon } from "lucide-react"

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

export default async function ProjectNotFound() {
  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderXIcon />
          </EmptyMedia>
          <EmptyTitle>{t("projectNotFoundTitle")}</EmptyTitle>
          <EmptyDescription>{t("projectNotFoundDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("backToProjects")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
