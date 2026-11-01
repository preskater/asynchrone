"use client"

import { ErrorState } from "@/components/states/error-state"

export default function AppGroupError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return <ErrorState error={error} retry={retry} className="min-h-svh" />
}
