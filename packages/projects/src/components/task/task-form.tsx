"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { DatePicker } from "./date-picker"
import { MemberPicker } from "./member-picker"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { Separator } from "@workspace/ui/components/separator"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { useProjectStore, type CreateTaskInput } from "../../ui/store"
import { repositoryProviderLabel } from "../../integrations/types"
import { useEnumLabel } from "@workspace/i18n/labels"
import {
  isEmptyTaskCustomFieldValue,
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  type Task,
  type TaskCustomFieldValue,
  type TaskCustomFieldValues,
  type TaskPriority,
  type TaskStatus,
  type TaskTemplate,
  type TaskTemplateField,
} from "../../types"

export interface TaskFormValue extends CreateTaskInput {}

/** Keep only the answered custom fields, trimmed. */
function customFieldPayload(
  fields: TaskTemplateField[],
  values: TaskCustomFieldValues
): TaskCustomFieldValues {
  const payload: TaskCustomFieldValues = {}
  for (const field of fields) {
    const value = values[field.id]
    if (value === undefined) continue
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed !== "") payload[field.id] = trimmed
    } else if (value.length > 0) {
      payload[field.id] = value
    }
  }
  return payload
}

export function TaskForm({
  projectId,
  task,
  template,
  formId,
  onSubmit,
}: {
  projectId: string
  task?: Task
  template?: TaskTemplate
  formId: string
  onSubmit: (value: TaskFormValue) => void
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const statusItems = TASK_STATUS_VALUES.map((value) => ({
    label: L.taskStatus(value),
    value,
  }))
  const { labels, getProject } = useProjectStore()
  const fields = template?.fields ?? []
  // Only a new task can opt out of issue creation: once a task is linked to an
  // issue, the link is kept. The checkbox is a base field, so it shows for the
  // quick task form and every template alike.
  const repositoryProvider = getProject(projectId)?.repositoryProvider
  const providerLabel = repositoryProvider
    ? repositoryProviderLabel(repositoryProvider)
    : ""
  const canChooseIssue = !task && repositoryProvider !== undefined
  const [title, setTitle] = React.useState(task?.title ?? "")
  const [description, setDescription] = React.useState(
    task?.description ?? template?.description ?? ""
  )
  const [status, setStatus] = React.useState<TaskStatus>(
    task?.status ?? template?.status ?? "todo"
  )
  const [priority, setPriority] = React.useState<TaskPriority>(
    task?.priority ?? template?.priority ?? "medium"
  )
  const [assigneeId, setAssigneeId] = React.useState<string | undefined>(
    task?.assigneeId
  )
  const [labelIds, setLabelIds] = React.useState<string[]>(
    task?.labelIds ?? template?.labelIds ?? []
  )
  const [dueDate, setDueDate] = React.useState<string | undefined>(
    task?.dueDate
  )
  const [endDate, setEndDate] = React.useState<string | undefined>(
    task?.endDate
  )
  const [customValues, setCustomValues] = React.useState<TaskCustomFieldValues>(
    () => ({ ...(task?.customFields ?? {}) })
  )
  const [createIssue, setCreateIssue] = React.useState(true)
  const [submitted, setSubmitted] = React.useState(false)
  const titleInvalid = submitted && !title.trim()

  function setCustomValue(
    fieldId: string,
    value: TaskCustomFieldValue | undefined
  ) {
    setCustomValues((prev) => {
      const next = { ...prev }
      const empty =
        value === undefined ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0)
      if (empty) {
        delete next[fieldId]
      } else {
        next[fieldId] = value
      }
      return next
    })
  }

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!title.trim()) return
        if (
          fields.some(
            (field) =>
              field.required &&
              isEmptyTaskCustomFieldValue(customValues[field.id])
          )
        ) {
          return
        }
        const answered = fields.filter(
          (field) => !isEmptyTaskCustomFieldValue(customValues[field.id])
        )
        onSubmit({
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          assigneeId,
          labelIds,
          dueDate,
          endDate,
          createIssue: canChooseIssue ? createIssue : undefined,
          customFields:
            fields.length > 0
              ? customFieldPayload(answered, customValues)
              : undefined,
        })
      }}
    >
      <FieldGroup>
        <Field data-invalid={titleInvalid}>
          <FieldLabel htmlFor={`${formId}-title`}>{t("title")}</FieldLabel>
          <Input
            id={`${formId}-title`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("titlePlaceholder")}
            aria-invalid={titleInvalid}
            aria-describedby={
              titleInvalid ? `${formId}-title-error` : undefined
            }
            autoFocus
          />
          {titleInvalid ? (
            <FieldError id={`${formId}-title-error`}>
              {t("titleRequired")}
            </FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description`}>
            {t("description")}
          </FieldLabel>
          <Textarea
            id={`${formId}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("taskDescriptionPlaceholder")}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${formId}-status`}>{t("status")}</FieldLabel>
            <Select
              items={statusItems}
              value={status}
              onValueChange={(value) => setStatus(value as TaskStatus)}
            >
              <SelectTrigger id={`${formId}-status`} className="w-full">
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
            <FieldLabel htmlFor={`${formId}-assignee`}>
              {t("assignee")}
            </FieldLabel>
            <MemberPicker
              value={assigneeId}
              onChange={setAssigneeId}
              disabled={false}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={`${formId}-priority`}>
            {t("priority")}
          </FieldLabel>
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
          <FieldLabel htmlFor={`${formId}-labels`}>{t("labels")}</FieldLabel>
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
          <FieldDescription>{t("labelsHint")}</FieldDescription>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${formId}-due`}>{t("dueDate")}</FieldLabel>
            <DatePicker
              id={`${formId}-due`}
              value={dueDate}
              onChange={setDueDate}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${formId}-end`}>{t("endDate")}</FieldLabel>
            <DatePicker
              id={`${formId}-end`}
              value={endDate}
              onChange={setEndDate}
            />
          </Field>
        </div>
        {canChooseIssue ? (
          <Field orientation="horizontal">
            <Checkbox
              id={`${formId}-create-issue`}
              checked={createIssue}
              onCheckedChange={(checked) => setCreateIssue(checked === true)}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel
                htmlFor={`${formId}-create-issue`}
                className="font-normal"
              >
                {t("taskCreateIssue", {
                  provider: providerLabel,
                })}
              </FieldLabel>
              <FieldDescription>{t("taskCreateIssueHint")}</FieldDescription>
            </div>
          </Field>
        ) : null}
        {fields.length > 0 ? (
          <>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t("customFields")}
            </p>
            {fields.map((field) => (
              <TaskCustomFieldInput
                key={field.id}
                formId={formId}
                field={field}
                value={customValues[field.id]}
                invalid={
                  submitted &&
                  field.required &&
                  isEmptyTaskCustomFieldValue(customValues[field.id])
                }
                onChange={(value) => setCustomValue(field.id, value)}
              />
            ))}
          </>
        ) : null}
      </FieldGroup>
    </form>
  )
}

/** One custom template field, rendered by its configured input type. */
function TaskCustomFieldInput({
  formId,
  field,
  value,
  invalid,
  onChange,
}: {
  formId: string
  field: TaskTemplateField
  value?: TaskCustomFieldValue
  invalid: boolean
  onChange: (value: TaskCustomFieldValue | undefined) => void
}) {
  const t = useTranslations("Projects")
  const id = `${formId}-${field.id}`
  const textValue = typeof value === "string" ? value : ""
  const errorId = invalid ? `${id}-error` : undefined

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>
        {field.label}
        {field.required ? <span aria-hidden> *</span> : null}
      </FieldLabel>
      {field.type === "text" ? (
        <Input
          id={id}
          value={textValue}
          aria-invalid={invalid}
          aria-describedby={errorId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          value={textValue}
          aria-invalid={invalid}
          aria-describedby={errorId}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" ? (
        <Select
          items={field.options.map((option) => ({
            value: option,
            label: option,
          }))}
          value={textValue || null}
          onValueChange={(next) => onChange((next as string) ?? undefined)}
        >
          <SelectTrigger
            id={id}
            className="w-full"
            aria-invalid={invalid}
            aria-describedby={errorId}
          >
            <SelectValue placeholder={t("selectPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : field.type === "radio" ? (
        <ToggleGroup
          value={textValue ? [textValue] : []}
          onValueChange={(next) => onChange(next[0])}
          spacing={2}
          className="flex-wrap"
        >
          {field.options.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              variant="outline"
              size="sm"
            >
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : field.type === "checkbox" ? (
        <ToggleGroup
          multiple
          value={Array.isArray(value) ? value : []}
          onValueChange={(next) => onChange(next as string[])}
          spacing={2}
          className="flex-wrap"
        >
          {field.options.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              variant="outline"
              size="sm"
            >
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <DatePicker
          id={id}
          value={textValue || undefined}
          onChange={(next) => onChange(next)}
          invalid={invalid}
          aria-describedby={errorId}
        />
      )}
      {invalid ? (
        <FieldError id={errorId}>{t("fieldRequiredError")}</FieldError>
      ) : null}
    </Field>
  )
}
