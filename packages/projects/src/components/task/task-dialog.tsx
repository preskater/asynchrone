"use client"

import * as React from "react"
import { ArrowLeftIcon, FileTextIcon, ZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { TaskForm, type TaskFormValue } from "./task-form"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"

import { useEnumLabel } from "@workspace/i18n/labels"
import { useProjectStore } from "../../ui/store"
import type { Task, TaskTemplate } from "../../types"

export function TaskFormDialog({
  projectId,
  task,
  trigger,
  open: controlledOpen,
  onOpenChange,
  quickTask = false,
}: {
  projectId: string
  task?: Task
  trigger?: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Skip the template chooser and open the blank form directly. */
  quickTask?: boolean
}) {
  const t = useTranslations("Projects")
  const { createTask, updateTask, templatesForProject } = useProjectStore()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [templateId, setTemplateId] = React.useState<string | undefined>()
  const [step, setStep] = React.useState<"choose" | "form">("form")
  const formId = React.useId()
  const templates = templatesForProject(projectId)
  const canChoose = !task && !quickTask && templates.length > 0
  const template = task
    ? templates.find((item) => item.id === task.templateId)
    : templates.find((item) => item.id === templateId)

  // Every time the dialog opens, start from the chooser (when available).
  React.useEffect(() => {
    if (!open) return
    setTemplateId(undefined)
    setStep(canChoose ? "choose" : "form")
  }, [open, canChoose])

  function handleSubmit(value: TaskFormValue) {
    if (task) {
      updateTask(task.id, {
        title: value.title,
        description: value.description,
        status: value.status,
        priority: value.priority,
        assigneeId: value.assigneeId ?? null,
        labelIds: value.labelIds,
        dueDate: value.dueDate ?? null,
        endDate: value.endDate ?? null,
        customFields: value.customFields,
      })
    } else {
      createTask({ ...value, templateId: template?.id })
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {step === "choose" ? (
          <TemplateChooser
            templates={templates}
            onSelect={(id) => {
              setTemplateId(id)
              setStep("form")
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-2">
                {canChoose ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    aria-label={t("backToTemplates")}
                    onClick={() => setStep("choose")}
                  >
                    <ArrowLeftIcon />
                  </Button>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <DialogTitle>
                    {task
                      ? t("editTaskTitle", { identifier: task.identifier })
                      : t("createTaskTitle")}
                  </DialogTitle>
                  <DialogDescription>
                    {template
                      ? t("createFromTemplateDescription", {
                          name: template.name,
                        })
                      : task
                        ? t("updateTaskDescription")
                        : t("createTaskDescription")}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <TaskForm
              key={`${open ? "open" : "closed"}-${template?.id ?? "blank"}`}
              formId={formId}
              projectId={projectId}
              task={task}
              template={template}
              onSubmit={handleSubmit}
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" form={formId}>
                {task ? t("save") : t("createTask")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Step one of the create flow: pick a template or start from the default
 * form, like GitHub's issue template chooser.
 */
function TemplateChooser({
  templates,
  onSelect,
}: {
  templates: TaskTemplate[]
  onSelect: (templateId: string | undefined) => void
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("createTaskTitle")}</DialogTitle>
        <DialogDescription>{t("chooseTemplateDescription")}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <TemplateChooserCard
          icon={<ZapIcon className="size-4" />}
          title={t("quickTask")}
          description={t("quickTaskDescription")}
          onClick={() => onSelect(undefined)}
        />
        {templates.map((template) => (
          <TemplateChooserCard
            key={template.id}
            icon={<FileTextIcon className="size-4" />}
            title={template.name}
            description={template.description}
            meta={
              <>
                {template.fields.length > 0 ? (
                  <>
                    <span>
                      {t("fieldCount", { count: template.fields.length })}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                ) : null}
                <span>{L.taskStatus(template.status)}</span>
                <span aria-hidden>·</span>
                <span>{L.taskPriority(template.priority)}</span>
              </>
            }
            onClick={() => onSelect(template.id)}
          />
        ))}
      </div>
    </>
  )
}

function TemplateChooserCard({
  icon,
  title,
  description,
  meta,
  onClick,
}: {
  icon: React.ReactElement
  title: string
  description?: string
  meta?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-xl border px-4 py-3 text-start transition-colors hover:border-primary/50 hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
        {meta ? (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </span>
    </button>
  )
}
