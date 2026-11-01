"use client"

import * as React from "react"
import {
  CalendarDaysIcon,
  EllipsisIcon,
  MessageSquareIcon,
  PencilIcon,
  SquareCheckIcon,
  Trash2Icon,
} from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useLocale, useTranslations } from "next-intl"

import { MemberAvatar } from "./member-avatar"
import { LabelTag, PriorityBadge } from "./task-badge"
import { TaskFormDialog } from "./task-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import { useProjectStore } from "../../ui/store"
import { formatDate, type Task } from "../../types"

export function TaskCardContent({
  task,
  dragging,
}: {
  task: Task
  dragging?: boolean
}) {
  const locale = useLocale()
  const { getMember, getLabel } = useProjectStore()
  const assignee = getMember(task.assigneeId)
  const taskLabels = task.labelIds
    .map((id) => getLabel(id))
    .filter((label) => label !== undefined)
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.done).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {task.identifier}
          </span>
          <span
            className={cn("text-sm font-medium", dragging && "line-clamp-2")}
          >
            {task.title}
          </span>
        </div>
      </div>
      {taskLabels.length ? (
        <div className="flex flex-wrap gap-2">
          {taskLabels.slice(0, 3).map((label) => (
            <LabelTag key={label.id} label={label} />
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <PriorityBadge priority={task.priority} />
          {task.dueDate ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="size-3.5" />
              {formatDate(task.dueDate, locale)}
            </span>
          ) : null}
          {task.comments.length ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquareIcon className="size-3.5" />
              {task.comments.length}
            </span>
          ) : null}
          {task.subtasks.length ? (
            <span className="inline-flex items-center gap-1">
              <SquareCheckIcon className="size-3.5" />
              {doneSubtasks}/{task.subtasks.length}
            </span>
          ) : null}
        </div>
        {assignee ? <MemberAvatar member={assignee} size="sm" /> : null}
      </div>
    </div>
  )
}

export function TaskCard({
  task,
  projectId,
  onOpen,
}: {
  task: Task
  projectId: string
  onOpen: (taskId: string) => void
}) {
  const t = useTranslations("Projects")
  const { deleteTask } = useProjectStore()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { status: task.status } })

  return (
    <div
      ref={setNodeRef}
      data-fx-card
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={cn(
        "group/task relative flex flex-col gap-3 rounded-xl bg-card p-3 text-sm ring-1 ring-foreground/10 transition-shadow",
        isDragging && "opacity-40"
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        data-no-fx
        className="cursor-grab text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        onClick={() => onOpen(task.id)}
      >
        <TaskCardContent task={task} />
      </button>
      <div className="absolute end-2 top-2 opacity-0 transition-opacity group-hover/task:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onPointerDown={(event) => event.stopPropagation()}
              />
            }
          >
            <EllipsisIcon />
            <span className="sr-only">{t("taskActions")}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onOpen(task.id)}>
                <SquareCheckIcon />
                {t("viewDetails")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <PencilIcon />
                {t("editTask")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2Icon />
                {t("deleteTask")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TaskFormDialog
        projectId={projectId}
        task={task}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteTaskQuestion", {
                identifier: task.identifier,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteTaskDescription", { title: task.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteTask(task.id)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
