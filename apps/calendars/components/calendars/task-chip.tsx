"use client"

import { CheckSquareIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

import type { Task } from "@workspace/projects/types"

export function TaskChip({
  task,
  onClick,
  className,
}: {
  task: Task
  onClick?: (task: Task) => void
  className?: string
}) {
  const done = task.status === "done"

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick?.(task)
      }}
      title={`${task.identifier} · ${task.title}`}
      className={cn(
        "flex w-full items-center gap-1.5 truncate rounded-md border border-dashed px-1.5 py-0.5 text-start text-xs leading-tight transition-colors hover:bg-muted/60",
        done && "opacity-60",
        className
      )}
    >
      <CheckSquareIcon
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground"
      />
      <span className="truncate font-medium">{task.title}</span>
      <span className="ms-auto shrink-0 text-[0.65rem] text-muted-foreground">
        {task.identifier}
      </span>
    </button>
  )
}
