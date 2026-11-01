"use client"

import * as React from "react"
import {
  CircleDotIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  SendIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { DatePicker } from "./date-picker"
import { MemberAvatar } from "./member-avatar"
import { MemberPicker } from "./member-picker"
import { PriorityBadge } from "./task-badge"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Separator } from "@workspace/ui/components/separator"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

import { useProjectStore } from "../../ui/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import {
  formatDate,
  isEmptyTaskCustomFieldValue,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  type TaskPriority,
  type TaskStatus,
} from "../../types"

const SILENT = { silent: true } as const

function TaskDetailsBody({ taskId }: { taskId: string }) {
  const t = useTranslations("Projects")
  const locale = useLocale()
  const L = useEnumLabel()
  const statusItems = TASK_STATUS_VALUES.map((value) => ({
    label: L.taskStatus(value),
    value,
  }))
  const store = useProjectStore()
  const {
    labels,
    templates,
    getLabel,
    getMember,
    updateTask,
    toggleSubtask,
    addComment,
  } = store
  const task = store.tasks.find((item) => item.id === taskId)
  const [comment, setComment] = React.useState("")

  if (!task) return null

  const taskLabels = task.labelIds
    .map((id) => getLabel(id))
    .filter((label) => label !== undefined)
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.done).length
  const template = task.templateId
    ? templates.find((item) => item.id === task.templateId)
    : undefined
  const customFields = template?.fields ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {task.identifier}
          </span>
          <PriorityBadge priority={task.priority} />
        </div>
        <Field>
          <FieldLabel htmlFor="detail-title" className="sr-only">
            {t("title")}
          </FieldLabel>
          <Textarea
            id="detail-title"
            className="min-h-0 resize-none text-base font-medium"
            value={task.title}
            onChange={(event) =>
              updateTask(task.id, { title: event.target.value }, SILENT)
            }
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="detail-status">{t("status")}</FieldLabel>
          <Select
            items={statusItems}
            value={task.status}
            onValueChange={(value) =>
              updateTask(task.id, { status: value as TaskStatus }, SILENT)
            }
          >
            <SelectTrigger id="detail-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {statusItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="detail-assignee">{t("assignee")}</FieldLabel>
          <MemberPicker
            value={task.assigneeId}
            onChange={(value) =>
              updateTask(task.id, { assigneeId: value }, SILENT)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="detail-due">{t("dueDate")}</FieldLabel>
          <DatePicker
            value={task.dueDate}
            onChange={(value) =>
              updateTask(task.id, { dueDate: value }, SILENT)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="detail-end">{t("endDate")}</FieldLabel>
          <DatePicker
            value={task.endDate}
            onChange={(value) =>
              updateTask(task.id, { endDate: value }, SILENT)
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="detail-priority">{t("priority")}</FieldLabel>
          <ToggleGroup
            value={[task.priority]}
            onValueChange={(value) => {
              if (value[0]) {
                updateTask(
                  task.id,
                  { priority: value[0] as TaskPriority },
                  SILENT
                )
              }
            }}
            spacing={2}
            className="flex-wrap"
          >
            {TASK_PRIORITY_VALUES.map((value) => (
              <ToggleGroupItem
                key={value}
                value={value}
                variant="outline"
                size="sm"
              >
                {L.taskPriority(value)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="detail-labels">{t("labels")}</FieldLabel>
        <ToggleGroup
          multiple
          value={taskLabels.map((label) => label.id)}
          onValueChange={(value) =>
            updateTask(task.id, { labelIds: value }, SILENT)
          }
          spacing={2}
          className="flex-wrap"
        >
          {labels.map((label) => (
            <ToggleGroupItem
              key={label.id}
              value={label.id}
              variant="outline"
              size="sm"
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field>
        <FieldLabel htmlFor="detail-description">{t("description")}</FieldLabel>
        <Textarea
          id="detail-description"
          defaultValue={task.description}
          placeholder={t("addDetailedDescription")}
          onChange={(event) =>
            updateTask(
              task.id,
              { description: event.target.value || undefined },
              SILENT
            )
          }
        />
      </Field>

      {customFields.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {t("customFields")}
          </p>
          <dl className="flex flex-col gap-2">
            {customFields.map((field) => {
              const value = task.customFields[field.id]
              const empty = isEmptyTaskCustomFieldValue(value)
              const display = empty
                ? t("dash")
                : field.type === "date" && typeof value === "string"
                  ? (formatDate(value, locale) ?? t("dash"))
                  : Array.isArray(value)
                    ? value.join(", ")
                    : value
              return (
                <div key={field.id} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd
                    className={
                      empty ? "text-sm text-muted-foreground" : "text-sm"
                    }
                  >
                    {display}
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>
      ) : null}

      {task.externalIssueUrl || task.externalPrUrl ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {t("repositoryLinks")}
          </p>
          <div className="flex flex-wrap gap-2">
            {task.externalIssueUrl && task.externalIssueNumber ? (
              <a
                href={task.externalIssueUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <CircleDotIcon className="size-3.5" />
                {t("repositoryIssue", { number: task.externalIssueNumber })}
                <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
            {task.externalPrUrl && task.externalPrNumber ? (
              <a
                href={task.externalPrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <GitPullRequestIcon className="size-3.5" />
                {t("repositoryPullRequest", { number: task.externalPrNumber })}
                <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("subtasks")}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneSubtasks}/{task.subtasks.length}
          </span>
        </div>
        {task.subtasks.length ? (
          <FieldGroup className="gap-2">
            {task.subtasks.map((subtask) => (
              <Field
                key={subtask.id}
                orientation="horizontal"
                className="items-center"
              >
                <Checkbox
                  id={subtask.id}
                  checked={subtask.done}
                  onCheckedChange={() => toggleSubtask(task.id, subtask.id)}
                />
                <FieldLabel
                  htmlFor={subtask.id}
                  className={
                    subtask.done
                      ? "font-normal line-through opacity-60"
                      : "font-normal"
                  }
                >
                  {subtask.title}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noSubtasks")}</p>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-3 pb-4">
        <h3 className="text-sm font-medium">{t("activityAndComments")}</h3>
        {task.comments.length ? (
          <div className="flex flex-col gap-3">
            {task.comments.map((entry) => {
              const isClient = entry.authorKind === "client"
              const member = isClient ? undefined : getMember(entry.authorId)
              const author =
                isClient && entry.authorName
                  ? {
                      id: entry.authorId,
                      name: entry.authorName,
                      email: "",
                      role: "viewer" as const,
                    }
                  : member
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <MemberAvatar member={author} size="sm" />
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {author?.name ?? entry.authorName ?? t("unknown")}
                      </span>
                      {isClient ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t("clientBadge")}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.createdAt, locale)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.body}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noComments")}</p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={comment}
            placeholder={t("writeComment")}
            className="min-h-9"
            onChange={(event) => setComment(event.target.value)}
          />
          <Button
            size="icon"
            disabled={!comment.trim()}
            aria-label={t("sendComment")}
            onClick={() => {
              addComment(task.id, "u_aria", comment.trim())
              setComment("")
            }}
          >
            <SendIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TaskDetails({
  taskId,
  open,
  onOpenChange,
}: {
  taskId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const store = useProjectStore()
  const task = taskId
    ? store.tasks.find((item) => item.id === taskId)
    : undefined

  if (!task) return null

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} showSwipeHandle>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>{task.identifier}</DrawerTitle>
            <DrawerDescription className="line-clamp-1">
              {task.title}
            </DrawerDescription>
          </DrawerHeader>
          <TaskDetailsBody taskId={task.id} />
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{task.identifier}</SheetTitle>
          <SheetDescription className="line-clamp-1">
            {task.title}
          </SheetDescription>
        </SheetHeader>
        <TaskDetailsBody taskId={task.id} />
      </SheetContent>
    </Sheet>
  )
}
