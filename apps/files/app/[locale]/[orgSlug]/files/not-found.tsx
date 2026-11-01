import { FileXIcon } from "lucide-react"
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

export default async function FilesNotFound() {
  const t = await getTranslations("AppPages")

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileXIcon />
          </EmptyMedia>
          <EmptyTitle>{t("fileNotFoundTitle")}</EmptyTitle>
          <EmptyDescription>{t("fileNotFoundDescription")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button nativeButton={false} render={<Link href="/" />}>
            {t("backToFiles")}
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
