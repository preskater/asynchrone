import { ArrowLeftIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import { Link } from "@workspace/i18n/navigation"

export function AuthHomeButton() {
  const t = useTranslations("Auth")

  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/" />}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      {t("backToHome")}
    </Button>
  )
}
