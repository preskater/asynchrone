"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { ChevronLeftIcon, ChevronRightIcon, CircleHelpIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useEmployeeActions } from "./actions"
import { unwrapActionResult } from "@workspace/core/action"
import { STATUS_CLASSES } from "../colors"
import {
  addDaysToKey,
  addMonthsToKey,
  eachDateKey,
  formatDateKey,
  isWeekendKey,
  monthDateRange,
  monthKeyOf,
  startOfWeekKey,
} from "../date-utils"
import { holidaysInRange, isWorkingDayKey } from "../holidays"
import type {
  AttendanceEntryData,
  AttendanceStatus,
  DayPeriod,
  EmployeeOverviewData,
} from "../types"
import { ATTENDANCE_STATUSES } from "../types"
import { entryIndex, entryOn, leaveStatusOnDate } from "../utils"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { getInitials } from "@workspace/organization/utils"

import { EntryDialog } from "./entry-dialog"
import { useTodayKey } from "./use-employees"

type CalendarView = "week" | "month"

export function TeamCalendar({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const { fetchAttendanceAction } = useEmployeeActions()
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const todayKey = useTodayKey(data.todayKey)

  const [view, setView] = React.useState<CalendarView>("week")
  const [anchor, setAnchor] = React.useState(() =>
    startOfWeekKey(data.todayKey)
  )
  const [userFilter, setUserFilter] = React.useState("all")
  const [statusFilter, setStatusFilter] = React.useState<
    AttendanceStatus | "all"
  >("all")
  const [extra, setExtra] = React.useState<
    Record<string, AttendanceEntryData[]>
  >({})
  const [ranges, setRanges] = React.useState<{ start: string; end: string }[]>([
    data.attendanceRange,
  ])
  const [loading, setLoading] = React.useState(false)
  const [cell, setCell] = React.useState<{
    userId: string
    date: string
    period: DayPeriod
  } | null>(null)
  const requestIdRef = React.useRef(0)

  const projectById = React.useMemo(
    () => new Map(data.projects.map((project) => [project.id, project])),
    [data.projects]
  )
  const activityById = React.useMemo(
    () => new Map(data.activities.map((activity) => [activity.id, activity])),
    [data.activities]
  )

  const days = React.useMemo(() => {
    if (view === "week") {
      return eachDateKey(anchor, addDaysToKey(anchor, 6))
    }
    const { start, end } = monthDateRange(monthKeyOf(anchor))
    return eachDateKey(start, end)
  }, [view, anchor])

  const rangeStart = days[0]!
  const rangeEnd = days[days.length - 1]!
  const holidays = React.useMemo(
    () => holidaysInRange(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  )

  const entries = React.useMemo(() => {
    const map = new Map<string, AttendanceEntryData>()
    for (const entry of data.attendance) map.set(entry.id, entry)
    for (const list of Object.values(extra)) {
      for (const entry of list) map.set(entry.id, entry)
    }
    return [...map.values()]
  }, [data.attendance, extra])
  const index = React.useMemo(() => entryIndex(entries), [entries])

  React.useEffect(() => {
    const covered = ranges.some(
      (range) => range.start <= rangeStart && range.end >= rangeEnd
    )
    if (covered) return
    const id = ++requestIdRef.current
    setLoading(true)
    fetchAttendanceAction(rangeStart, rangeEnd)
      .then((result) => {
        const value = unwrapActionResult(result)
        setExtra((prev) => ({
          ...prev,
          [`${rangeStart}:${rangeEnd}`]: value.entries,
        }))
        setRanges((prev) => [...prev, { start: rangeStart, end: rangeEnd }])
      })
      .catch((error) => toast.error(te(error, "employeesLoadFailed")))
      .finally(() => {
        if (requestIdRef.current === id) setLoading(false)
      })
  }, [rangeStart, rangeEnd, ranges, te])

  const members = React.useMemo(() => {
    const active = data.members.filter((member) => member.profile.isActive)
    const filtered =
      userFilter === "all"
        ? active
        : active.filter((member) => member.id === userFilter)
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }, [data.members, userFilter])

  function isEditable(userId: string) {
    return userId === data.currentUserId
      ? data.access.canTrack
      : data.access.isAdmin
  }

  function shift(direction: -1 | 1) {
    if (view === "week") {
      setAnchor(addDaysToKey(anchor, direction * 7))
    } else {
      setAnchor(`${addMonthsToKey(monthKeyOf(anchor), direction)}-01`)
    }
  }

  function goToday() {
    setAnchor(
      view === "week" ? startOfWeekKey(todayKey) : `${monthKeyOf(todayKey)}-01`
    )
  }

  const gridTemplateColumns = `minmax(10rem, 1fr) repeat(${days.length}, minmax(2.75rem, 1fr))`

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("calendar.previous")}
                onClick={() => shift(-1)}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("calendar.next")}
                onClick={() => shift(1)}
              >
                <ChevronRightIcon />
              </Button>
              <Button size="sm" variant="outline" onClick={goToday}>
                {t("calendar.today")}
              </Button>
              <span className="ms-2 text-sm font-medium whitespace-nowrap">
                {view === "week"
                  ? `${formatDateKey(rangeStart, locale)} – ${formatDateKey(rangeEnd, locale)}`
                  : formatDateKey(rangeStart, locale, {
                      month: "long",
                      year: "numeric",
                    })}
              </span>
              {loading ? <Spinner className="size-4" /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={[
                  { value: "all", label: t("calendar.allMembers") },
                  ...data.members
                    .filter((member) => member.profile.isActive)
                    .map((member) => ({
                      value: member.id,
                      label: member.name,
                    })),
                ]}
                value={userFilter}
                onValueChange={(value) => setUserFilter(value as string)}
              >
                <SelectTrigger size="sm" className="min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("calendar.allMembers")}
                    </SelectItem>
                    {data.members
                      .filter((member) => member.profile.isActive)
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                items={[
                  { value: "all", label: t("calendar.allStatuses") },
                  ...ATTENDANCE_STATUSES.map((value) => ({
                    value,
                    label: L.attendanceStatus(value),
                  })),
                ]}
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as AttendanceStatus | "all")
                }
              >
                <SelectTrigger size="sm" className="min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">
                      {t("calendar.allStatuses")}
                    </SelectItem>
                    {ATTENDANCE_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        <StatusLabel status={value} />
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ToggleGroup
                value={[view]}
                onValueChange={(value) => {
                  const next = value[0] as CalendarView | undefined
                  if (!next) return
                  setView(next)
                  setAnchor(
                    next === "week"
                      ? startOfWeekKey(anchor)
                      : `${monthKeyOf(anchor)}-01`
                  )
                }}
                spacing={2}
              >
                <ToggleGroupItem value="week" variant="outline" size="sm">
                  {t("calendar.week")}
                </ToggleGroupItem>
                <ToggleGroupItem value="month" variant="outline" size="sm">
                  {t("calendar.month")}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div
                className="grid items-center gap-x-1 border-b pb-2"
                style={{ gridTemplateColumns }}
              >
                <div />
                {days.map((day) => {
                  const weekend = isWeekendKey(day)
                  const holiday = holidays.get(day)
                  const isToday = day === todayKey
                  return (
                    <div
                      key={day}
                      className={cn(
                        "flex flex-col items-center text-xs",
                        weekend && "text-muted-foreground",
                        holiday && "text-destructive"
                      )}
                      title={
                        holiday
                          ? (t(`holidays.${holiday}` as never) as string)
                          : undefined
                      }
                    >
                      <span className="text-[10px] uppercase">
                        {formatDateKey(day, locale, { weekday: "short" })}
                      </span>
                      <span
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full font-medium",
                          isToday && "bg-foreground text-background"
                        )}
                      >
                        {Number(day.slice(8, 10))}
                      </span>
                      {holiday ? (
                        <span
                          aria-hidden
                          className="mt-0.5 size-1 rounded-full bg-destructive"
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-col">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="grid items-center gap-x-1 border-b py-1 last:border-b-0"
                    style={{ gridTemplateColumns }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden pe-2">
                      <Avatar className="size-6">
                        {member.avatarUrl ? (
                          <AvatarImage src={member.avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="text-[10px]">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-sm">{member.name}</span>
                    </div>
                    {days.map((day) => {
                      const weekend = isWeekendKey(day)
                      const holiday = holidays.get(day)
                      const future = day > todayKey
                      const pending =
                        leaveStatusOnDate(
                          data.leaveRequests,
                          member.id,
                          day
                        ) === "pending"
                      const weekendLike =
                        (weekend || Boolean(holiday)) &&
                        !isWorkingDayKey(day, holidays)

                      return (
                        <div
                          key={day}
                          className={cn(
                            "flex flex-col gap-0.5 rounded-sm p-0.5",
                            weekendLike && "bg-muted/50"
                          )}
                        >
                          {(["morning", "afternoon"] as DayPeriod[]).map(
                            (period) => {
                              const entry = entryOn(
                                index,
                                member.id,
                                day,
                                period
                              )
                              const dimmed =
                                statusFilter !== "all" &&
                                entry !== undefined &&
                                entry.status !== statusFilter
                              const label = entry
                                ? L.attendanceStatus(entry.status)
                                : pending
                                  ? t("calendar.pendingLeave")
                                  : t("calendar.noEntry")
                              const allocation = entry?.projectId
                                ? projectById.get(entry.projectId)?.name
                                : entry?.internalActivityId
                                  ? activityById.get(entry.internalActivityId)
                                      ?.name
                                  : undefined
                              const detail = allocation
                                ? `${label ?? ""} · ${allocation}`
                                : label
                              return (
                                <button
                                  key={period}
                                  type="button"
                                  disabled={!isEditable(member.id)}
                                  title={detail ?? undefined}
                                  onClick={() =>
                                    setCell({
                                      userId: member.id,
                                      date: day,
                                      period,
                                    })
                                  }
                                  className={cn(
                                    "h-4 w-full rounded-[3px] transition-colors",
                                    entry
                                      ? STATUS_CLASSES[entry.status].cell
                                      : "bg-muted/60 hover:bg-muted",
                                    dimmed && "opacity-25",
                                    pending &&
                                      !entry &&
                                      "border border-dashed border-[color:var(--chart-4)] bg-[color:var(--chart-4)]/10",
                                    future &&
                                      !pending &&
                                      "border border-dashed border-muted-foreground/30",
                                    !isEditable(member.id) && "cursor-default"
                                  )}
                                />
                              )
                            }
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
            {ATTENDANCE_STATUSES.map((status) => (
              <span
                key={status}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    STATUS_CLASSES[status].dot
                  )}
                />
                <StatusLabel status={status} />
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-3 rounded-[3px] border border-dashed border-[color:var(--chart-4)]" />
              {t("calendar.legendPending")}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-3 rounded-[3px] border border-dashed border-muted-foreground/40" />
              {t("calendar.legendPlanned")}
            </span>
            <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleHelpIcon className="size-3.5" />
              {t("calendar.clickHint")}
            </span>
          </div>
        </CardContent>
      </Card>

      {cell ? (
        <EntryDialog
          data={data}
          targetUserId={cell.userId}
          date={cell.date}
          period={cell.period}
          existing={entryOn(index, cell.userId, cell.date, cell.period)}
          open
          onOpenChange={(open) => {
            if (!open) setCell(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** Localized attendance status label (shared by filter and legend). */
function StatusLabel({ status }: { status: AttendanceStatus }) {
  const L = useEnumLabel()
  return <span>{L.attendanceStatus(status)}</span>
}
