"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { startTeamTrialAction } from "@/actions/trial"
import { useRouter } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

export function StartTrialButton() {
  const t = useTranslations("Trial")
  const te = useErrorTranslator()
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  function start() {
    startTransition(async () => {
      try {
        unwrapActionResult(await startTeamTrialAction())
        toast.success(t("started"))
        router.refresh()
      } catch (error) {
        toast.error(te(error, "internal"))
      }
    })
  }

  return (
    <Button onClick={start} disabled={pending}>
      {t("start")}
    </Button>
  )
}
