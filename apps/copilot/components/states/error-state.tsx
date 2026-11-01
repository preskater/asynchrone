"use client"

import { useEffect } from "react"
import { AlertTriangleIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { cn } from "@workspace/ui/lib/utils"

export function ErrorState({
  error,
  retry,
  title = "Something went wrong",
  description = "An unexpected error occurred. You can try again, or head back and continue working.",
  retryLabel = "Try again",
  referenceLabel,
  className,
}: {
  error: Error & { digest?: string }
  retry: () => void
  title?: string
  description?: string
  retryLabel?: string
  referenceLabel?: string
  className?: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className={cn(
        "flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6",
        className
      )}
    >
      <Empty className="flex-1 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertTriangleIcon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>
            {description}
            {error.digest ? (
              <span className="mt-1 block text-xs opacity-70">
                {referenceLabel ?? `Reference: ${error.digest}`}
              </span>
            ) : null}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => retry()}>{retryLabel}</Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
