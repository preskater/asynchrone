"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { useEnumLabel } from "@workspace/i18n/labels"
import { useProjectStore } from "../../ui/store"
import {
  CHOICE_FIELD_TYPES,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TEMPLATE_FIELD_TYPES,
  type TaskPriority,
  type TaskStatus,
  type TaskTemplate,
  type TaskTemplateField,
  type TaskTemplateFieldType,
} from "../../types"

/** Draft state while editing one custom field of a template. */
interface TemplateFieldDraft {
  id: string
  label: string
  type: TaskTemplateFieldType
  required: boolean
  optionsText: string
}

function newFieldId() {
  return `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function isChoiceField(type: TaskTemplateFieldType) {
  return CHOICE_FIELD_TYPES.includes(type)
}

function fieldDraftFrom(field: TaskTemplateField): TemplateFieldDraft {
  return {
    id: field.id,
    label: field.label,
    type: field.type,
    required: field.required,
    optionsText: field.options.join("\n"),
  }
}

/** One option per line, trimmed and deduplicated. */
function parseOptions(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    )
  )
}

function TemplateDialog({
  projectId,
  template,
  trigger,
}: {
  projectId: string
  template?: TaskTemplate
  trigger: React.ReactElement
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const { labels, createTemplate, updateTemplate } = useProjectStore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(template?.name ?? "")
  const [description, setDescription] = React.useState(
    template?.description ?? ""
  )
  const [status, setStatus] = React.useState<TaskStatus>(
    template?.status ?? "todo"
  )
  const [priority, setPriority] = React.useState<TaskPriority>(
    template?.priority ?? "medium"
  )
  const [labelIds, setLabelIds] = React.useState<string[]>(
    template?.labelIds ?? []
  )
  const [fields, setFields] = React.useState<TemplateFieldDraft[]>(() =>
    (template?.fields ?? []).map(fieldDraftFrom)
  )
  const [submitted, setSubmitted] = React.useState(false)

  function reset() {
    setName(template?.name ?? "")
    setDescription(template?.description ?? "")
    setStatus(template?.status ?? "todo")
    setPriority(template?.priority ?? "medium")
    setLabelIds(template?.labelIds ?? [])
    setFields((template?.fields ?? []).map(fieldDraftFrom))
    setSubmitted(false)
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        id: newFieldId(),
        label: "",
        type: "text",
        required: false,
        optionsText: "",
      },
    ])
  }

  function updateField(index: number, patch: Partial<TemplateFieldDraft>) {
    setFields((prev) =>
      prev.map((field, i) => (i === index ? { ...field, ...patch } : field))
    )
  }

  function moveField(index: number, direction: -1 | 1) {
    setFields((prev) => {
      const target = index + direction
      const current = prev[index]
      const other = prev[target]
      if (!current || !other) return prev
      const next = [...prev]
      next[index] = other
      next[target] = current
      return next
    })
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const nameInvalid = submitted && !name.trim()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? t("editTemplate") : t("createTemplate")}
          </DialogTitle>
          <DialogDescription>{t("templateDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (!name.trim()) return
            const hasInvalidField = fields.some(
              (field) =>
                !field.label.trim() ||
                (isChoiceField(field.type) &&
                  parseOptions(field.optionsText).length === 0)
            )
            if (hasInvalidField) return
            const payload = fields.map((field): TaskTemplateField => ({
              id: field.id,
              label: field.label.trim(),
              type: field.type,
              required: field.required,
              options: isChoiceField(field.type)
                ? parseOptions(field.optionsText)
                : [],
            }))
            if (template) {
              updateTemplate(template.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                status,
                priority,
                labelIds,
                fields: payload,
              })
            } else {
              createTemplate({
                projectId,
                name: name.trim(),
                description: description.trim() || undefined,
                status,
                priority,
                labelIds,
                fields: payload,
              })
            }
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field data-invalid={nameInvalid}>
              <FieldLabel htmlFor={`tpl-${projectId}-name`}>
                {t("name")}
              </FieldLabel>
              <Input
                id={`tpl-${projectId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("templateNamePlaceholder")}
                aria-invalid={nameInvalid}
                aria-describedby={
                  nameInvalid ? `tpl-${projectId}-name-error` : undefined
                }
                autoFocus
              />
              {nameInvalid ? (
                <FieldError id={`tpl-${projectId}-name-error`}>
                  {t("nameRequired")}
                </FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`tpl-${projectId}-description`}>
                {t("description")}
              </FieldLabel>
              <Textarea
                id={`tpl-${projectId}-description`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("taskDescriptionPlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel>{t("status")}</FieldLabel>
              <Select
                items={TASK_STATUS_VALUES.map((value) => ({
                  value,
                  label: L.taskStatus(value),
                }))}
                value={status}
                onValueChange={(value) => setStatus(value as TaskStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {TASK_STATUS_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {L.taskStatus(value)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t("priority")}</FieldLabel>
              <ToggleGroup
                value={[priority]}
                onValueChange={(value) =>
                  value[0] && setPriority(value[0] as TaskPriority)
                }
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
            <Field>
              <FieldLabel>{t("labels")}</FieldLabel>
              <ToggleGroup
                multiple
                value={labelIds}
                onValueChange={(value) => setLabelIds(value as string[])}
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
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{t("formFields")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("formFieldsDescription")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addField}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("addField")}
                </Button>
              </div>
              {fields.map((field, index) => (
                <TemplateFieldEditor
                  key={field.id}
                  field={field}
                  index={index}
                  count={fields.length}
                  submitted={submitted}
                  onChange={(patch) => updateField(index, patch)}
                  onMove={(direction) => moveField(index, direction)}
                  onRemove={() => removeField(index)}
                />
              ))}
            </div>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">
              {template ? t("save") : t("createTemplate")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TaskTemplatesManager({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const { templatesForProject, getLabel, removeTemplate } = useProjectStore()
  const templates = templatesForProject(projectId)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("templates")}</CardTitle>
            <CardDescription>{t("templatesDescription")}</CardDescription>
          </div>
          <TemplateDialog
            projectId={projectId}
            trigger={
              <Button size="sm">
                <PlusIcon data-icon="inline-start" />
                {t("createTemplate")}
              </Button>
            }
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {t("noTemplates")}
          </p>
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium">{template.name}</span>
                {template.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {template.description}
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
                  {template.labelIds.map((labelId) => {
                    const label = getLabel(labelId)
                    if (!label) return null
                    return (
                      <span
                        key={labelId}
                        className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5"
                      >
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <TemplateDialog
                  projectId={projectId}
                  template={template}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("editTemplate")}
                    >
                      <PencilIcon />
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("deleteTemplate")}
                  onClick={() => removeTemplate(template.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

/** Editor card for one custom field of the template form. */
function TemplateFieldEditor({
  field,
  index,
  count,
  submitted,
  onChange,
  onMove,
  onRemove,
}: {
  field: TemplateFieldDraft
  index: number
  count: number
  submitted: boolean
  onChange: (patch: Partial<TemplateFieldDraft>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const labelInvalid = submitted && !field.label.trim()
  const optionsInvalid =
    submitted &&
    isChoiceField(field.type) &&
    parseOptions(field.optionsText).length === 0
  const typeItems = TASK_TEMPLATE_FIELD_TYPES.map((value) => ({
    value,
    label: L.taskTemplateFieldType(value),
  }))

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t("fieldNumber", { number: index + 1 })}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={index === 0}
            aria-label={t("moveFieldUp")}
            onClick={() => onMove(-1)}
          >
            <ChevronUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={index === count - 1}
            aria-label={t("moveFieldDown")}
            onClick={() => onMove(1)}
          >
            <ChevronDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("removeField")}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field data-invalid={labelInvalid}>
          <FieldLabel htmlFor={`tf-${field.id}-label`}>
            {t("fieldLabel")}
          </FieldLabel>
          <Input
            id={`tf-${field.id}-label`}
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder={t("fieldLabelPlaceholder")}
            aria-invalid={labelInvalid}
            aria-describedby={
              labelInvalid ? `tf-${field.id}-label-error` : undefined
            }
          />
          {labelInvalid ? (
            <FieldError id={`tf-${field.id}-label-error`}>
              {t("fieldLabelRequired")}
            </FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`tf-${field.id}-type`}>
            {t("fieldType")}
          </FieldLabel>
          <Select
            items={typeItems}
            value={field.type}
            onValueChange={(value) =>
              onChange({ type: value as TaskTemplateFieldType })
            }
          >
            <SelectTrigger id={`tf-${field.id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {typeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      {isChoiceField(field.type) ? (
        <Field data-invalid={optionsInvalid}>
          <FieldLabel htmlFor={`tf-${field.id}-options`}>
            {t("fieldOptions")}
          </FieldLabel>
          <Textarea
            id={`tf-${field.id}-options`}
            value={field.optionsText}
            onChange={(event) => onChange({ optionsText: event.target.value })}
            placeholder={t("fieldOptionsPlaceholder")}
            aria-invalid={optionsInvalid}
            aria-describedby={
              optionsInvalid ? `tf-${field.id}-options-error` : undefined
            }
          />
          <FieldDescription>{t("fieldOptionsHint")}</FieldDescription>
          {optionsInvalid ? (
            <FieldError id={`tf-${field.id}-options-error`}>
              {t("fieldOptionsRequired")}
            </FieldError>
          ) : null}
        </Field>
      ) : null}
      <Field orientation="horizontal" className="items-center">
        <Checkbox
          id={`tf-${field.id}-required`}
          checked={field.required}
          onCheckedChange={(checked) =>
            onChange({ required: checked === true })
          }
        />
        <FieldLabel htmlFor={`tf-${field.id}-required`} className="font-normal">
          {t("fieldRequired")}
        </FieldLabel>
      </Field>
    </div>
  )
}
