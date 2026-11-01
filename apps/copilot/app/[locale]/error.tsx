"use client"

import * as React from "react"
import * as Sentry from "@sentry/nextjs"
import { useTranslations } from "next-intl"

import { ErrorState } from "@/components/states/error-state"

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations("Error")

  React.useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <ErrorState
      error={error}
      retry={retry}
      title={t("title")}
      description={t("description")}
      referenceLabel={
        error.digest ? t("reference", { digest: error.digest }) : undefined
      }
      retryLabel={t("retry")}
      className="min-h-svh"
    />
  )
}
