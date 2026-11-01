import { CompassIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import { NotFoundState } from "@/components/states/not-found-state"
import { Link } from "@workspace/i18n/navigation"

export default function NotFound() {
  const t = useTranslations("NotFound")

  return (
    <main className="flex min-h-svh w-full items-center justify-center">
      <NotFoundState
        icon={CompassIcon}
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/" />}>
              {t("backHome")}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/sign-in" />}
            >
              {t("signIn")}
            </Button>
          </div>
        }
      />
    </main>
  )
}
