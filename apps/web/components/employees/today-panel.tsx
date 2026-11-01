"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ArrowRightIcon,
  Building2Icon,
  CircleAlertIcon,
  HomeIcon,
  InfoIcon,
  PlaneIcon,
  TriangleAlertIcon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { setDayStatusAction } from "@/actions/employees"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { STATUS_CLASSES } from "@/lib/employees/colors"
import {
  addDaysToKey,
  formatDateKey,
} from "@/lib/employees/date-utils"
import type {
  AlertData,
  AttendanceEntryData,
  EmployeeOverviewData,
} from "@/lib/employees/types"
import { entryIndex, entryOn, formatHours } from "@/lib/employees/utils"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { getInitials } from "@workspace/organization/utils"

import { EntryDialog } from "./entry-dialog"
import { DecideLeaveDialog } from "./leave-dialogs"
import { StatusBadge, presenceCategory } from "./status-chip"
import { useTodayKey } from "./use-employees"

const SEVERITY_ICON = {
  info: InfoIcon,
  warning: TriangleAlertIcon,
  critical: CircleAlertIcon,
} as const

const SEVERITY_CLASS = {
  info: "text-[color:var(--chart-3)]",
  warning: "text-[color:var(--chart-4)]",
  critical: "text-destructive",
} as const

function alertMessage(
  alert: AlertData,
  t: (key: string, values?: Record<string, string | number>) => string
) {
  switch (alert.kind) {
    case "no_allocation":
      return t("alerts.noAllocation", {
        name: alert.userName ?? "",
        count: alert.count ?? 0,
      })
    case "overallocated":
      return t("alerts.overallocated", {
        name: alert.userName ?? "",
        hours: formatHours(alert.hours ?? 0),
      })
    case "low_balance":
      return t("alerts.lowBalance", {
        name: alert.userName ?? "",
        days: formatHours(alert.days ?? 0),
      })
    case "pending_validation":
      return t("alerts.pendingValidation", { count: alert.count ?? 0 })
    case "project_overrun":
      return t("alerts.projectOverrun", {
        name: alert.projectName ?? "",
        used: formatHours(alert.hours ?? 0),
        planned: formatHours(alert.plannedHours ?? 0),
      })
    case "missing_attendance":
      return t("alerts.missingAttendance", {
        name: alert.userName ?? "",
        count: alert.count ?? 0,
      })
  }
}

export function TodayPanel({
  data,
  onNavigate,
}: {
  data: EmployeeOverviewData
  onNavigate: (tab: string) => void
}) {
  const t = useTranslations("Employees")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()
  const todayKey = useTodayKey(data.todayKey)

  const [quickPending, setQuickPending] = React.useState<string | null>(null)
  const [dialogHalf, setDialogHalf] = React.useState<
    "morning" | "afternoon" | null
  >(null)

  const index = React.useMemo(() => entryIndex(data.attendance), [data.attendance])
  const activeMembers = data.members.filter((member) => member.profile.isActive)
  const memberById = React.useMemo(
    () => new Map(data.members.map((member) => [member.id, member])),
    [data.members]
  )
  const projectById = React.useMemo(
    () => new Map(data.projects.map((project) => [project.id, project])),
    [data.projects]
  )
  const activityById = React.useMemo(
    () => new Map(data.activities.map((activity) => [activity.id, activity])),
    [data.activities]
  )

  const counts = { on_site: 0, remote: 0, absent: 0, unset: 0 }
  for (const member of activeMembers) {
    const afternoon = entryOn(index, member.id, todayKey, "afternoon")
    const morning = entryOn(index, member.id, todayKey, "morning")
    const entry = afternoon ?? morning
    counts[presenceCategory(entry?.status)] += 1
  }

  const upcoming = data.leaveRequests
    .filter(
      (request) =>
        request.status === "approved" &&
        request.startDate <= addDaysToKey(todayKey, 14) &&
        request.endDate >= todayKey
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const myMorning = entryOn(index, data.currentUserId, todayKey, "morning")
  const myAfternoon = entryOn(index, data.currentUserId, todayKey, "afternoon")

  function allocationLabel(entry?: AttendanceEntryData) {
    if (!entry) return null
    if (entry.projectId) {
      return projectById.get(entry.projectId)?.name ?? null
    }
    if (entry.internalActivityId) {
      return activityById.get(entry.internalActivityId)?.name ?? null
    }
    return null
  }

  async function quickSet(status: "on_site" | "remote") {
    setQuickPending(status)
    try {
      unwrapActionResult(
        await setDayStatusAction({ date: todayKey, status })
      )
      toast.success(tT("attendanceSaved"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesAttendanceFailed"))
    } finally {
      setQuickPending(null)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">
                  {t("today.teamTitle")}
                </CardTitle>
                <CardDescription>
                  {formatDateKey(todayKey, locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_CLASSES.on_site.dot)} />
                  {t("today.countOnSite", { count: counts.on_site })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_CLASSES.remote.dot)} />
                  {t("today.countRemote", { count: counts.remote })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_CLASSES.leave.dot)} />
                  {t("today.countAbsent", { count: counts.absent })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                  {t("today.countUnset", { count: counts.unset })}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {activeMembers.map((member) => {
              const morning = entryOn(index, member.id, todayKey, "morning")
              const afternoon = entryOn(index, member.id, todayKey, "afternoon")
              const isMe = member.id === data.currentUserId
              const editable = isMe ? data.access.canTrack : data.access.isAdmin
              const allocation =
                allocationLabel(afternoon) ?? allocationLabel(morning)
              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar className="size-7">
                      {member.avatarUrl ? (
                        <AvatarImage src={member.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-xs">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm">
                        {member.name}
                        {isMe ? (
                          <span className="ms-1 text-muted-foreground">
                            {t("today.you")}
                          </span>
                        ) : null}
                      </span>
                      {allocation ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {allocation}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HalfChip
                      entry={morning}
                      label={t("today.am")}
                      onEdit={
                        editable
                          ? () => setDialogHalf("morning")
                          : undefined
                      }
                    />
                    <HalfChip
                      entry={afternoon}
                      label={t("today.pm")}
                      onEdit={
                        editable
                          ? () => setDialogHalf("afternoon")
                          : undefined
                      }
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("today.alertsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {data.alerts.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                {t("today.noAlerts")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {data.alerts.map((alert) => {
                  const Icon = SEVERITY_ICON[alert.severity]
                  return (
                    <li
                      key={alert.id}
                      className="flex items-center gap-3 border-t px-6 py-2.5 first:border-t-0"
                    >
                      <Icon className={cn("size-4 shrink-0", SEVERITY_CLASS[alert.severity])} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {alertMessage(alert, (key, values) =>
                          t(key as never, values as never)
                        )}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onNavigate(alert.tab)}
                      >
                        {t("today.open")}
                        <ArrowRightIcon data-icon="inline-end" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {data.access.canTrack ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("today.myDayTitle")}
              </CardTitle>
              <CardDescription>{t("today.myDayDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  disabled={quickPending !== null}
                  onClick={() => void quickSet("on_site")}
                >
                  {quickPending === "on_site" ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Building2Icon data-icon="inline-start" />
                  )}
                  {t("today.officeAllDay")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={quickPending !== null}
                  onClick={() => void quickSet("remote")}
                >
                  {quickPending === "remote" ? (
                    <Spinner className="size-4" />
                  ) : (
                    <HomeIcon data-icon="inline-start" />
                  )}
                  {t("today.remoteAllDay")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("today.am")}</span>
                {myMorning ? (
                  <StatusBadge status={myMorning.status} />
                ) : (
                  <Badge variant="outline">{t("today.notSet")}</Badge>
                )}
                <span className="ms-2">{t("today.pm")}</span>
                {myAfternoon ? (
                  <StatusBadge status={myAfternoon.status} />
                ) : (
                  <Badge variant="outline">{t("today.notSet")}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("today.myDayHint")}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PlaneIcon className="size-4 text-muted-foreground" />
                {t("today.pendingTitle")}
              </CardTitle>
              {data.pendingApprovals.length > 0 ? (
                <Badge variant="secondary">
                  {data.pendingApprovals.length}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {data.pendingApprovals.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                {t("today.noPending")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {data.pendingApprovals.slice(0, 6).map((request) => {
                  const canDecide =
                    data.access.isValidator &&
                    request.userId !== data.currentUserId
                  return (
                    <li
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t px-6 py-2.5 first:border-t-0"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">
                          {request.userName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {L.leaveType(request.type)} ·{" "}
                          {formatDateKey(request.startDate, locale)} –{" "}
                          {formatDateKey(request.endDate, locale)} ·{" "}
                          {t("leave.halfDaysShort", {
                            count: request.halfDays,
                          })}
                        </span>
                      </div>
                      {canDecide ? (
                        <DecideLeaveDialog
                          request={request}
                          currentUserId={data.currentUserId}
                          trigger={
                            <Button size="sm" variant="outline">
                              {t("today.review")}
                            </Button>
                          }
                        />
                      ) : (
                        <Badge variant="secondary">
                          {L.leaveStatus(request.status)}
                        </Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4 text-muted-foreground" />
              {t("today.upcomingTitle")}
            </CardTitle>
            <CardDescription>
              {t("today.upcomingDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {upcoming.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                {t("today.noUpcoming")}
              </p>
            ) : (
              <ul className="flex flex-col">
                {upcoming.slice(0, 8).map((request) => (
                  <li
                    key={request.id}
                    className="flex items-center justify-between gap-3 border-t px-6 py-2.5 first:border-t-0"
                  >
                    <span className="truncate text-sm">{request.userName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {L.leaveType(request.type)} ·{" "}
                      {formatDateKey(request.startDate, locale)} –{" "}
                      {formatDateKey(request.endDate, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dialogHalf ? (
        <EntryDialog
          data={data}
          targetUserId={data.currentUserId}
          date={todayKey}
          period={dialogHalf}
          existing={entryOn(index, data.currentUserId, todayKey, dialogHalf)}
          open
          onOpenChange={(open) => {
            if (!open) setDialogHalf(null)
          }}
        />
      ) : null}
    </div>
  )
}

function HalfChip({
  entry,
  label,
  onEdit,
}: {
  entry?: AttendanceEntryData
  label: string
  onEdit?: () => void
}) {
  const content = (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase">
        {label}
      </span>
      {entry ? (
        <StatusBadge status={entry.status} />
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          —
        </Badge>
      )}
    </span>
  )
  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md px-1 py-0.5 transition-colors hover:bg-muted"
      >
        {content}
      </button>
    )
  }
  return <span className="px-1 py-0.5">{content}</span>
}
