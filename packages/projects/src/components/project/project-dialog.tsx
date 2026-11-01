"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

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

import { useProjectStore } from "../../ui/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import {
  PROJECT_STATUS_VALUES,
  type Project,
  type ProjectStatus,
} from "../../types"

export function ProjectFormDialog({
  trigger,
  project,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactElement
  project?: Project
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const statusItems = PROJECT_STATUS_VALUES.map((value) => ({
    label: L.projectStatus(value),
    value,
  }))
  const { createProject, updateProject } = useProjectStore()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [name, setName] = React.useState(project?.name ?? "")
  const [description, setDescription] = React.useState(
    project?.description ?? ""
  )
  const [status, setStatus] = React.useState<ProjectStatus>(
    project?.status ?? "active"
  )
  const [submitted, setSubmitted] = React.useState(false)
  const nameInvalid = submitted && !name.trim()

  React.useEffect(() => {
    if (open) {
      setName(project?.name ?? "")
      setDescription(project?.description ?? "")
      setStatus(project?.status ?? "active")
      setSubmitted(false)
    }
  }, [open, project])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!name.trim()) return
    if (project) {
      updateProject(project.id, { name, description, status })
    } else {
      createProject({ name: name.trim(), description, status })
    }
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {project ? t("editProject") : t("createProject")}
          </DialogTitle>
          <DialogDescription>
            {project
              ? t("updateProjectDescription")
              : t("createProjectDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field data-invalid={nameInvalid}>
              <FieldLabel htmlFor="project-name">{t("name")}</FieldLabel>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
                aria-invalid={nameInvalid}
                autoFocus
              />
              {nameInvalid ? (
                <FieldError>{t("nameRequired")}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="project-description">
                {t("description")}
              </FieldLabel>
              <Textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
              <FieldDescription>{t("descriptionHint")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="project-status">{t("status")}</FieldLabel>
              <Select
                items={statusItems}
                value={status}
                onValueChange={(value) => setStatus(value as ProjectStatus)}
              >
                <SelectTrigger id="project-status" className="w-full">
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
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">{project ? t("save") : t("create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CreateProjectButton({ label }: { label?: string }) {
  const t = useTranslations("Projects")
  return (
    <ProjectFormDialog
      trigger={<Button>{label ?? t("createProject")}</Button>}
    />
  )
}
