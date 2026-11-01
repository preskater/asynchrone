import type { LucideIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"

import { cn } from "@workspace/ui/lib/utils"

export function NotFoundState({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center px-6 py-16",
        className
      )}
    >
      <Empty className="w-full max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          {description ? (
            <EmptyDescription>{description}</EmptyDescription>
          ) : null}
        </EmptyHeader>
        {actions ? <EmptyContent>{actions}</EmptyContent> : null}
      </Empty>
    </div>
  )
}
