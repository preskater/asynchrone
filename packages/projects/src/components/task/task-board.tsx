"use client"

import * as React from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CirclePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { TaskCard, TaskCardContent } from "./task-card"
import { TaskFormDialog } from "./task-dialog"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useProjectStore } from "../../ui/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import { TASK_STATUS_VALUES, type Task, type TaskStatus } from "../../types"

const COLUMN_TINT: Record<TaskStatus, string> = {
  backlog: "bg-muted/40",
  todo: "bg-muted/40",
  in_progress: "bg-primary/5",
  review: "bg-muted/40",
  done: "bg-muted/40",
}

function TaskColumn({
  status,
  label,
  tasks,
  projectId,
  onOpen,
}: {
  status: TaskStatus
  label: string
  tasks: Task[]
  projectId: string
  onOpen: (taskId: string) => void
}) {
  const t = useTranslations("Projects")
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  })

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{label}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tasks.length}
          </span>
        </div>
        <TaskFormDialog
          projectId={projectId}
          quickTask
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("addTo", { label })}
            >
              <CirclePlusIcon />
            </Button>
          }
        />
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-xl border border-dashed border-border/60 p-2 transition-colors",
          COLUMN_TINT[status],
          isOver && "border-primary/50 ring-2 ring-primary/20"
        )}
      >
        <SortableContext
          items={tasks.map((task) => task.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

export function TaskBoard({
  projectId,
  tasks,
  onOpen,
}: {
  projectId: string
  tasks: Task[]
  onOpen: (taskId: string) => void
}) {
  const L = useEnumLabel()
  const { moveTask } = useProjectStore()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const activeTask = activeId
    ? tasks.find((task) => task.id === activeId)
    : undefined

  function resolveStatus(overId: string): TaskStatus | undefined {
    if (TASK_STATUS_VALUES.includes(overId as TaskStatus)) {
      return overId as TaskStatus
    }
    return tasks.find((task) => task.id === overId)?.status
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const status = resolveStatus(String(over.id))
    if (status) {
      moveTask(String(active.id), status)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
        {TASK_STATUS_VALUES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            label={L.taskStatus(status)}
            projectId={projectId}
            tasks={tasks.filter((task) => task.status === status)}
            onOpen={onOpen}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="w-72 rounded-xl bg-card p-3 shadow-lg ring-1 ring-foreground/10">
            <TaskCardContent task={activeTask} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
