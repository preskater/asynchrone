"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
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
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientFieldDefinitionData,
  ClientFieldEntity,
  ClientFieldValues,
} from "../types"
import { CLIENT_FIELD_TYPES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** Dynamic inputs for the custom fields of one entity, inside a form. */
export function CustomFieldInputs({
  definitions,
  values,
  onChange,
}: {
  definitions: ClientFieldDefinitionData[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
}) {
  const L = useEnumLabel()
  if (definitions.length === 0) return null

  return (
    <>
      {definitions.map((def) => {
        const value = values[def.key]
        const id = `client-field-${def.key}`
        return (
          <Field key={def.key}>
            <FieldLabel htmlFor={id}>
              {def.label}
              {def.isRequired ? " *" : ""}
            </FieldLabel>
            {def.type === "select" ? (
              <Select
                items={def.options.map((option) => ({
                  value: option,
                  label: option,
                }))}
                value={typeof value === "string" ? value : ""}
                onValueChange={(next) => onChange(def.key, next)}
              >
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {def.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : def.type === "multiselect" ? (
              <div className="flex flex-wrap gap-3 pt-1">
                {def.options.map((option) => {
                  const selected =
                    Array.isArray(value) && value.includes(option)
                  return (
                    <label
                      key={option}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) => {
                          const list = Array.isArray(value) ? [...value] : []
                          const next =
                            checked === true
                              ? [...list, option]
                              : list.filter((item) => item !== option)
                          onChange(def.key, next)
                        }}
                      />
                      {option}
                    </label>
                  )
                })}
              </div>
            ) : def.type === "boolean" ? (
              <label className="flex items-center gap-2 pt-1 text-sm">
                <Checkbox
                  checked={value === true || value === "true"}
                  onCheckedChange={(checked) =>
                    onChange(def.key, checked === true)
                  }
                />
                {L.clientFieldType("boolean")}
              </label>
            ) : (
              <Input
                id={id}
                type={
                  def.type === "number"
                    ? "number"
                    : def.type === "date"
                      ? "date"
                      : def.type === "email"
                        ? "email"
                        : def.type === "url"
                          ? "url"
                          : def.type === "phone"
                            ? "tel"
                            : "text"
                }
                value={
                  value === null || value === undefined ? "" : String(value)
                }
                onChange={(event) => onChange(def.key, event.target.value)}
              />
            )}
          </Field>
        )
      })}
    </>
  )
}

/** Read-only rendering of custom field values for a detail page. */
export function CustomFieldValuesView({
  definitions,
  values,
}: {
  definitions: ClientFieldDefinitionData[]
  values: ClientFieldValues
}) {
  const t = useTranslations("Clients")
  const visible = definitions.filter((def) => !isBlank(values[def.key]))
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase">
        {t("common.customFields")}
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {visible.map((def) => {
          const value = values[def.key]
          let display: string
          if (typeof value === "boolean") {
            display = value ? "✓" : "✗"
          } else if (Array.isArray(value)) {
            display = value.join(", ")
          } else {
            display = String(value)
          }
          return (
            <div key={def.key} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{def.label}</dt>
              <dd className="text-sm">{display}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

const EMPTY_FORM = {
  entity: "client" as ClientFieldEntity,
  label: "",
  type: "text" as (typeof CLIENT_FIELD_TYPES)[number],
  options: "",
  isRequired: false,
}

/** Admin dialog to manage the organization's custom field definitions. */
export function CustomFieldsManagerDialog({
  definitions,
  trigger,
}: {
  definitions: ClientFieldDefinitionData[]
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { saveFieldDefinitionAction, deleteFieldDefinitionAction } =
    useClientActions()

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] =
    React.useState<ClientFieldDefinitionData | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [submitting, setSubmitting] = React.useState(false)

  function startCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function startEdit(def: ClientFieldDefinitionData) {
    setEditing(def)
    setForm({
      entity: def.entity,
      label: def.label,
      type: def.type,
      options: def.options.join(", "),
      isRequired: def.isRequired,
    })
    setFormOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveFieldDefinitionAction({
          id: editing?.id,
          entity: form.entity,
          label: form.label,
          type: form.type,
          options:
            form.type === "select" || form.type === "multiselect"
              ? form.options
                  .split(",")
                  .map((option) => option.trim())
                  .filter(Boolean)
              : [],
          isRequired: form.isRequired,
        })
      )
      toast.success(tT("fieldSaved"))
      setFormOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(def: ClientFieldDefinitionData) {
    try {
      unwrapActionResult(await deleteFieldDefinitionAction({ id: def.id }))
      toast.success(tT("fieldDeleted"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "clientSaveFailed"))
    }
  }

  const entityItems = (
    ["client", "contact", "deal"] as ClientFieldEntity[]
  ).map((value) => ({ value, label: t(`fields.entities.${value}`) }))

  const typeItems = CLIENT_FIELD_TYPES.map((value) => ({
    value,
    label: L.clientFieldType(value),
  }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFormOpen(false)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("fields.title")}</DialogTitle>
          <DialogDescription>{t("fields.description")}</DialogDescription>
        </DialogHeader>

        {formOpen ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="client-field-entity">
                  {t("fields.entity")}
                </FieldLabel>
                <Select
                  items={entityItems}
                  value={form.entity}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      entity: value as ClientFieldEntity,
                    }))
                  }
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger id="client-field-entity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {entityItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-field-label">
                  {t("fields.label")}
                </FieldLabel>
                <Input
                  id="client-field-label"
                  value={form.label}
                  maxLength={80}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, label: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-field-type">
                  {t("fields.type")}
                </FieldLabel>
                <Select
                  items={typeItems}
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      type: value as (typeof CLIENT_FIELD_TYPES)[number],
                    }))
                  }
                >
                  <SelectTrigger id="client-field-type" className="w-full">
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
              {form.type === "select" || form.type === "multiselect" ? (
                <Field>
                  <FieldLabel htmlFor="client-field-options">
                    {t("fields.options")}
                  </FieldLabel>
                  <Textarea
                    id="client-field-options"
                    value={form.options}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        options: event.target.value,
                      }))
                    }
                    placeholder={t("fields.optionsHint")}
                  />
                </Field>
              ) : null}
              <Field orientation="horizontal">
                <Checkbox
                  id="client-field-required"
                  checked={form.isRequired}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      isRequired: checked === true,
                    }))
                  }
                />
                <FieldLabel
                  htmlFor="client-field-required"
                  className="font-normal"
                >
                  {t("fields.required")}
                </FieldLabel>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !form.label.trim()}>
                {submitting ? <Spinner className="size-4" /> : null}
                {editing ? t("common.save") : t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-4">
              {(["client", "contact", "deal"] as ClientFieldEntity[]).map(
                (entity) => {
                  const list = definitions.filter(
                    (def) => def.entity === entity
                  )
                  return (
                    <div key={entity} className="flex flex-col gap-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        {t(`fields.entities.${entity}`)}
                      </p>
                      {list.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t("fields.empty")}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {list.map((def) => (
                            <li
                              key={def.id}
                              className="flex items-center gap-2 rounded-md border px-3 py-2"
                            >
                              <span className="flex-1 text-sm">
                                {def.label}
                              </span>
                              <Badge variant="secondary">
                                {L.clientFieldType(def.type)}
                              </Badge>
                              {def.isRequired ? (
                                <Badge variant="outline">
                                  {t("fields.required")}
                                </Badge>
                              ) : null}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t("fields.edit")}
                                onClick={() => startEdit(def)}
                              >
                                <PencilIcon className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t("fields.delete")}
                                onClick={() => void handleDelete(def)}
                              >
                                <TrashIcon className="size-4" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                }
              )}
            </div>
            <Separator />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                {t("common.cancel")}
              </DialogClose>
              <Button type="button" onClick={startCreate}>
                <PlusIcon data-icon="inline-start" />
                {t("fields.add")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
