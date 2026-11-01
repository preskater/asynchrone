"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

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
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useEmployeeActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientData,
  EmployeeMemberData,
  EmployeeOverviewData,
  InternalActivityData,
  ProjectOptionData,
} from "../types"
import { ACTIVITY_KINDS, CONTRACT_TYPES, EMPLOYMENT_TYPES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { EmployeeDatePicker } from "./employee-date-picker"

export function ProfileDialog({
  member,
  trigger,
}: {
  member: EmployeeMemberData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { updateProfileAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [employmentType, setEmploymentType] = React.useState(
    member.profile.employmentType
  )
  const [contractType, setContractType] = React.useState(
    member.profile.contractType
  )
  const [weeklyHours, setWeeklyHours] = React.useState(
    String(member.profile.weeklyHours)
  )
  const [isValidator, setIsValidator] = React.useState(
    member.profile.isValidator
  )
  const [isActive, setIsActive] = React.useState(member.profile.isActive)
  const [submitting, setSubmitting] = React.useState(false)

  const hoursValue = Number(weeklyHours)
  const hoursInvalid =
    weeklyHours === "" || !Number.isFinite(hoursValue) || hoursValue <= 0

  function reset() {
    setEmploymentType(member.profile.employmentType)
    setContractType(member.profile.contractType)
    setWeeklyHours(String(member.profile.weeklyHours))
    setIsValidator(member.profile.isValidator)
    setIsActive(member.profile.isActive)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (hoursInvalid) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await updateProfileAction({
          userId: member.id,
          employmentType,
          contractType,
          weeklyHours: hoursValue,
          isValidator,
          isActive,
        })
      )
      toast.success(tT("profileUpdated"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeeSettingsFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const employmentItems = EMPLOYMENT_TYPES.map((value) => ({
    value,
    label: L.employmentType(value),
  }))
  const contractItems = CONTRACT_TYPES.map((value) => ({
    value,
    label: L.contractType(value),
  }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member.name}</DialogTitle>
          <DialogDescription>{t("admin.profileDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="profile-employment">
                  {t("admin.employmentType")}
                </FieldLabel>
                <Select
                  items={employmentItems}
                  value={employmentType}
                  onValueChange={(value) =>
                    setEmploymentType(value as typeof employmentType)
                  }
                >
                  <SelectTrigger id="profile-employment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {employmentItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-contract">
                  {t("admin.contractType")}
                </FieldLabel>
                <Select
                  items={contractItems}
                  value={contractType}
                  onValueChange={(value) =>
                    setContractType(value as typeof contractType)
                  }
                >
                  <SelectTrigger id="profile-contract" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {contractItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field data-invalid={hoursInvalid}>
              <FieldLabel htmlFor="profile-hours">
                {t("admin.weeklyHours")}
              </FieldLabel>
              <Input
                id="profile-hours"
                type="number"
                min={1}
                max={80}
                step={0.5}
                value={weeklyHours}
                onChange={(event) => setWeeklyHours(event.target.value)}
                aria-invalid={hoursInvalid}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="profile-validator"
                checked={isValidator}
                onCheckedChange={(checked) => setIsValidator(checked === true)}
              />
              <FieldLabel htmlFor="profile-validator" className="font-normal">
                {t("admin.validatorLabel")}
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="profile-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel htmlFor="profile-active" className="font-normal">
                {t("admin.activeLabel")}
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ClientDialog({
  client,
  trigger,
}: {
  client?: ClientData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { saveClientAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [isActive, setIsActive] = React.useState(true)
  const [submitted, setSubmitted] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const nameInvalid = submitted && !name.trim()

  function reset() {
    setName(client?.name ?? "")
    setContactEmail(client?.contactEmail ?? "")
    setIsActive(client?.isActive ?? true)
    setSubmitted(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!name.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveClientAction({
          id: client?.id,
          name: name.trim(),
          contactEmail: contactEmail.trim() || null,
          isActive,
        })
      )
      toast.success(tT("clientSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeeSettingsFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {client ? t("admin.editClient") : t("admin.addClient")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={nameInvalid}>
              <FieldLabel htmlFor="client-name">
                {t("admin.clientName")}
              </FieldLabel>
              <Input
                id="client-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={nameInvalid}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-email">
                {t("admin.contactEmail")}
              </FieldLabel>
              <Input
                id="client-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="client-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel htmlFor="client-active" className="font-normal">
                {t("admin.activeLabel")}
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ActivityDialog({
  activity,
  trigger,
}: {
  activity?: InternalActivityData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { saveActivityAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [kind, setKind] = React.useState<"internal" | "non_billable">(
    "internal"
  )
  const [isActive, setIsActive] = React.useState(true)
  const [submitted, setSubmitted] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const nameInvalid = submitted && !name.trim()

  function reset() {
    setName(activity?.name ?? "")
    setDescription(activity?.description ?? "")
    setKind(activity?.kind ?? "internal")
    setIsActive(activity?.isActive ?? true)
    setSubmitted(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!name.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveActivityAction({
          id: activity?.id,
          name: name.trim(),
          description: description.trim() || null,
          kind,
          isActive,
        })
      )
      toast.success(tT("activitySaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeeSettingsFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const kindItems = ACTIVITY_KINDS.map((value) => ({
    value,
    label: L.activityKind(value),
  }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {activity ? t("admin.editActivity") : t("admin.addActivity")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={nameInvalid}>
              <FieldLabel htmlFor="activity-name">
                {t("admin.activityName")}
              </FieldLabel>
              <Input
                id="activity-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={nameInvalid}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-description">
                {t("admin.activityDescription")}
              </FieldLabel>
              <Textarea
                id="activity-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="activity-kind">
                {t("admin.activityKind")}
              </FieldLabel>
              <Select
                items={kindItems}
                value={kind}
                onValueChange={(value) =>
                  setKind(value as "internal" | "non_billable")
                }
              >
                <SelectTrigger id="activity-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="activity-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel htmlFor="activity-active" className="font-normal">
                {t("admin.activeLabel")}
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectDialog({
  data,
  project,
  trigger,
}: {
  data: EmployeeOverviewData
  project: ProjectOptionData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { updateProjectEmployeeAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [clientId, setClientId] = React.useState(project.clientId ?? "")
  const [plannedHours, setPlannedHours] = React.useState(
    project.plannedHours !== undefined ? String(project.plannedHours) : ""
  )
  const [isBillable, setIsBillable] = React.useState(project.isBillable)
  const [startDate, setStartDate] = React.useState(project.startDate ?? "")
  const [endDate, setEndDate] = React.useState(project.endDate ?? "")
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    setClientId(project.clientId ?? "")
    setPlannedHours(
      project.plannedHours !== undefined ? String(project.plannedHours) : ""
    )
    setIsBillable(project.isBillable)
    setStartDate(project.startDate ?? "")
    setEndDate(project.endDate ?? "")
  }

  const plannedValue = plannedHours === "" ? null : Number(plannedHours)
  const plannedInvalid =
    plannedValue !== null &&
    (!Number.isFinite(plannedValue) || plannedValue < 0)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (plannedInvalid) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await updateProjectEmployeeAction({
          projectId: project.id,
          clientId: clientId || null,
          plannedHours: plannedValue,
          isBillable,
          startDate: startDate || null,
          endDate: endDate || null,
        })
      )
      toast.success(tT("projectUpdated"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeeSettingsFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const clientItems = [
    { value: "", label: t("admin.noClient") },
    ...data.clients
      .filter((client) => client.isActive)
      .map((client) => ({ value: client.id, label: client.name })),
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project.name}</DialogTitle>
          <DialogDescription>{t("admin.projectDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={plannedInvalid}>
              <FieldLabel htmlFor="project-hours">
                {t("admin.plannedHours")}
              </FieldLabel>
              <Input
                id="project-hours"
                type="number"
                min={0}
                step={0.5}
                value={plannedHours}
                onChange={(event) => setPlannedHours(event.target.value)}
                placeholder={t("admin.plannedHoursPlaceholder")}
                aria-invalid={plannedInvalid}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="project-client">
                {t("admin.client")}
              </FieldLabel>
              <Select
                items={clientItems}
                value={clientId}
                onValueChange={(value) => setClientId(value as string)}
              >
                <SelectTrigger id="project-client" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {clientItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="project-start">
                  {t("admin.startDate")}
                </FieldLabel>
                <EmployeeDatePicker
                  id="project-start"
                  value={startDate || undefined}
                  onChange={setStartDate}
                  placeholder={t("admin.pickDate")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="project-end">
                  {t("admin.endDate")}
                </FieldLabel>
                <EmployeeDatePicker
                  id="project-end"
                  value={endDate || undefined}
                  onChange={setEndDate}
                  placeholder={t("admin.pickDate")}
                  disabledBefore={startDate || undefined}
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="project-billable"
                checked={isBillable}
                onCheckedChange={(checked) => setIsBillable(checked === true)}
              />
              <FieldLabel htmlFor="project-billable" className="font-normal">
                {t("admin.billableLabel")}
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
