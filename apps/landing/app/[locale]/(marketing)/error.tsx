"use client"

import { useTranslations } from "next-intl"

import { ErrorState } from "@/components/states/error-state"

export default function MarketingError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations("Error")
  return (
    <ErrorState
      error={error}
      retry={retry}
      title={t("title")}
      description={t("description")}
      retryLabel={t("retry")}
      referenceLabel={
        error.digest ? t("reference", { digest: error.digest }) : undefined
      }
      className="min-h-[60svh]"
    />
  )
}
