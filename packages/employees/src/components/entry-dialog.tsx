"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { cn } from "@workspace/ui/lib/utils"

import { useEmployeeActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { STATUS_CLASSES } from "../colors"
import { formatDateKey } from "../date-utils"
import {
  ATTENDANCE_STATUSES,
  isWorkingStatus,
  type AttendanceEntryData,
  type AttendanceStatus,
  type DayPeriod,
  type EmployeeOverviewData,
  type WorkLocationKind,
} from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { useTodayKey } from "./use-employees"

type AllocationKind = "none" | "project" | "activity"

export function EntryDialog({
  data,
  targetUserId,
  date,
  period,
  existing,
  open,
  onOpenChange,
}: {
  data: EmployeeOverviewData
  targetUserId: string
  date: string
  period: DayPeriod
  existing?: AttendanceEntryData
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Employees")
  const { setAttendanceAction, clearAttendanceAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()
  const todayKey = useTodayKey(data.todayKey)

  const [status, setStatus] = React.useState<AttendanceStatus>("on_site")
  const [location, setLocation] = React.useState<WorkLocationKind | "">("")
  const [allocationKind, setAllocationKind] =
    React.useState<AllocationKind>("none")
  const [projectId, setProjectId] = React.useState("")
  const [activityId, setActivityId] = React.useState("")
  const [comment, setComment] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)

  const reset = React.useCallback(() => {
    setStatus(existing?.status ?? "on_site")
    setLocation(existing?.location ?? "")
    setAllocationKind(
      existing?.projectId
        ? "project"
        : existing?.internalActivityId
          ? "activity"
          : "none"
    )
    setProjectId(existing?.projectId ?? "")
    setActivityId(existing?.internalActivityId ?? "")
    setComment(existing?.comment ?? "")
  }, [existing])

  React.useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const member = data.members.find((item) => item.id === targetUserId)
  const working = isWorkingStatus(status)
  const selectedProject = data.projects.find(
    (project) => project.id === projectId
  )

  const statusItems = ATTENDANCE_STATUSES.map((value) => ({
    value,
    label: L.attendanceStatus(value),
  }))
  const locationItems = [
    { value: "", label: t("entry.noLocation") },
    { value: "on_site", label: L.workLocationKind("on_site") },
    { value: "remote", label: L.workLocationKind("remote") },
    { value: "client_site", label: L.workLocationKind("client_site") },
    { value: "traveling", label: L.workLocationKind("traveling") },
    { value: "other", label: L.workLocationKind("other") },
  ]
  const projectItems = data.projects.map((project) => ({
    value: project.id,
    label: project.clientName
      ? `${project.name} — ${project.clientName}`
      : project.name,
  }))
  const activityItems = data.activities
    .filter((activity) => activity.isActive)
    .map((activity) => ({ value: activity.id, label: activity.name }))

  async function handleSave() {
    setSaving(true)
    try {
      unwrapActionResult(
        await setAttendanceAction({
          userId:
            targetUserId === data.currentUserId ? undefined : targetUserId,
          date,
          period,
          status,
          location: working && location ? location : null,
          projectId:
            working && allocationKind === "project" && projectId
              ? projectId
              : null,
          internalActivityId:
            working && allocationKind === "activity" && activityId
              ? activityId
              : null,
          comment: comment.trim() || null,
        })
      )
      toast.success(tT("attendanceSaved"))
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesAttendanceFailed"))
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setClearing(true)
    try {
      unwrapActionResult(
        await clearAttendanceAction({
          userId:
            targetUserId === data.currentUserId ? undefined : targetUserId,
          date,
          periods: [period],
        })
      )
      toast.success(tT("attendanceCleared"))
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesAttendanceFailed"))
    } finally {
      setClearing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {formatDateKey(date, locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}{" "}
            · {period === "morning" ? t("entry.morning") : t("entry.afternoon")}
          </DialogTitle>
          <DialogDescription>
            {member && targetUserId !== data.currentUserId
              ? t("entry.forUser", { name: member.name })
              : t("entry.description")}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel>{t("entry.status")}</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {statusItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={status === item.value}
                  onClick={() => setStatus(item.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                    status === item.value
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-input-border hover:bg-muted"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full",
                      STATUS_CLASSES[item.value].dot
                    )}
                  />
                  {item.label}
                </button>
              ))}
            </div>
          </Field>

          {working ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="entry-location">
                    {t("entry.location")}
                  </FieldLabel>
                  <Select
                    items={locationItems}
                    value={location}
                    onValueChange={(value) =>
                      setLocation(value as WorkLocationKind | "")
                    }
                  >
                    <SelectTrigger id="entry-location" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {locationItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="entry-allocation">
                    {t("entry.allocation")}
                  </FieldLabel>
                  <Select
                    items={[
                      { value: "none", label: t("entry.noAllocation") },
                      { value: "project", label: t("entry.project") },
                      { value: "activity", label: t("entry.activity") },
                    ]}
                    value={allocationKind}
                    onValueChange={(value) =>
                      setAllocationKind(value as AllocationKind)
                    }
                  >
                    <SelectTrigger id="entry-allocation" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="none">
                          {t("entry.noAllocation")}
                        </SelectItem>
                        <SelectItem value="project">
                          {t("entry.project")}
                        </SelectItem>
                        <SelectItem value="activity">
                          {t("entry.activity")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {allocationKind === "project" ? (
                <Field>
                  <FieldLabel htmlFor="entry-project">
                    {t("entry.project")}
                  </FieldLabel>
                  {projectItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("entry.noProjects")}
                    </p>
                  ) : (
                    <Select
                      items={projectItems}
                      value={projectId}
                      onValueChange={(value) => setProjectId(value as string)}
                    >
                      <SelectTrigger id="entry-project" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {projectItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                  {selectedProject ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Badge
                        variant="outline"
                        className={
                          selectedProject.isBillable
                            ? STATUS_CLASSES.on_site.chip
                            : undefined
                        }
                      >
                        {selectedProject.isBillable
                          ? t("entry.billable")
                          : t("entry.nonBillable")}
                      </Badge>
                    </div>
                  ) : null}
                </Field>
              ) : null}

              {allocationKind === "activity" ? (
                <Field>
                  <FieldLabel htmlFor="entry-activity">
                    {t("entry.activity")}
                  </FieldLabel>
                  {activityItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("entry.noActivities")}
                    </p>
                  ) : (
                    <Select
                      items={activityItems}
                      value={activityId}
                      onValueChange={(value) => setActivityId(value as string)}
                    >
                      <SelectTrigger id="entry-activity" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {activityItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : null}
            </>
          ) : null}

          <Field>
            <FieldLabel htmlFor="entry-comment">
              {t("entry.comment")}
            </FieldLabel>
            <Input
              id="entry-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("entry.commentPlaceholder")}
              maxLength={500}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          {existing ? (
            <Button
              type="button"
              variant="ghost"
              disabled={clearing || saving}
              onClick={() => void handleClear()}
              className="me-auto"
            >
              {clearing ? <Spinner className="size-4" /> : null}
              {t("entry.clear")}
            </Button>
          ) : null}
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("common.cancel")}
          </DialogClose>
          <Button
            type="button"
            disabled={saving || clearing}
            onClick={() => void handleSave()}
          >
            {saving ? <Spinner className="size-4" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
        {date > todayKey ? (
          <p className="text-xs text-muted-foreground">
            {t("entry.futureHint")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
