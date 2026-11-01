"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { DownloadIcon } from "lucide-react"
import { toast } from "sonner"

import { requestExportAction } from "@/actions/data-export"
import { useRouter } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

export function RequestExportButton({ disabled }: { disabled: boolean }) {
  const t = useTranslations("Org")
  const te = useErrorTranslator()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function request() {
    startTransition(async () => {
      try {
        unwrapActionResult(await requestExportAction())
        toast.success(t("exportRequested"))
        router.refresh()
      } catch (error) {
        toast.error(te(error, "internal"))
      }
    })
  }

  return (
    <Button variant="outline" onClick={request} disabled={disabled || pending}>
      <DownloadIcon data-icon="inline-start" />
      {t("exportRequest")}
    </Button>
  )
}
