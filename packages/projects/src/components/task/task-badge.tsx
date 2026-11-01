"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { useEnumLabel } from "@workspace/i18n/labels"
import type { Label, TaskPriority, TaskStatus } from "../../types"

const STATUS_BADGE_VARIANT: Record<
  TaskStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  backlog: "outline",
  todo: "secondary",
  in_progress: "default",
  review: "secondary",
  done: "outline",
}

export function StatusBadge({
  status,
  className,
}: {
  status: TaskStatus
  className?: string
}) {
  const L = useEnumLabel()
  return (
    <Badge variant={STATUS_BADGE_VARIANT[status]} className={cn(className)}>
      {L.taskStatus(status)}
    </Badge>
  )
}

/**
 * Priority labels keep fixed colors (one hue per priority) regardless of the
 * organization theme. The animations (fire, shimmer, float) are layered on
 * top by the appearance CSS through the `priority-badge` class.
 */
export function PriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority
  className?: string
}) {
  const L = useEnumLabel()
  return (
    <Badge
      variant="outline"
      data-priority={priority}
      className={cn("priority-badge", className)}
    >
      {L.taskPriority(priority)}
    </Badge>
  )
}

export function LabelTag({
  label,
  className,
}: {
  label: Label
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  )
}
