"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { AgendaView } from "@/components/calendars/agenda-view"
import { AvailabilityView } from "@/components/calendars/availability-view"
import { CalendarsHeader } from "@/components/calendars/calendars-header"
import { CalendarsSearchCommand } from "@/components/calendars/calendars-search"
import { CalendarsSidebar } from "@/components/calendars/calendars-sidebar"
import { EventDetailsSheet } from "@/components/calendars/event-details-sheet"
import { EventDialog } from "@/components/calendars/event-dialog"
import { MonthView } from "@/components/calendars/month-view"
import { TimeGrid } from "@/components/calendars/time-grid"

import {
  endOfWeek,
  formatRange,
  startOfWeek,
  addDays,
} from "@workspace/calendars/date-utils"
import { useCalendars } from "@/lib/calendars/store"
import { useProjectStore } from "@/lib/projects/store"
import { useRecents } from "@workspace/app-shell/recents"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"
import type { CalendarEvent, CalendarView } from "@workspace/calendars/types"

const VIEWS: CalendarView[] = ["day", "week", "month", "agenda", "availability"]

export function CalendarsWorkspace() {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const { moveEvent, showTasks, toggleShowTasks, ensureEventsLoaded } =
    useCalendars()
  const { ensureProjectData } = useProjectStore()
  const { record, active, hydrated } = useRecents()

  React.useEffect(() => {
    ensureEventsLoaded()
  }, [ensureEventsLoaded])
  const {
    calendarView: view,
    setCalendarView: setView,
    calendarFocusDate: focusDate,
    setCalendarFocusDate: setFocusDate,
    calendarSelectedMemberIds: selectedMemberIds,
    toggleCalendarMember: toggleMember,
  } = useWorkspaceNav()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [detailsEvent, setDetailsEvent] = React.useState<
    CalendarEvent | undefined
  >()
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [createRange, setCreateRange] = React.useState<
    { start: Date; end: Date } | undefined
  >()
  const [createOpen, setCreateOpen] = React.useState(false)

  const restoredRef = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated || restoredRef.current || !active.calendars) return
    restoredRef.current = true
    const separator = active.calendars.indexOf(":")
    const candidate = active.calendars.slice(0, separator) as CalendarView
    if (VIEWS.includes(candidate)) setView(candidate)
    const parsed = new Date(active.calendars.slice(separator + 1))
    if (!Number.isNaN(parsed.getTime())) setFocusDate(parsed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, active.calendars])

  React.useEffect(() => {
    if (!hydrated) return
    if (!restoredRef.current && active.calendars) return
    record("calendars", {
      id: `${view}:${focusDate.toISOString()}`,
      label: t(view),
      hint: focusDate.toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
      }),
      data: { view, date: focusDate.toISOString() },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focusDate, hydrated])

  const weekDays = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        addDays(startOfWeek(focusDate), index)
      ),
    [focusDate]
  )

  const rangeLabel =
    view === "week"
      ? formatRange(
          startOfWeek(focusDate),
          endOfWeek(focusDate),
          "week",
          locale
        )
      : formatRange(focusDate, focusDate, view, locale)

  function shift(direction: -1 | 1) {
    setFocusDate((prev) => {
      if (view === "day") return addDays(prev, direction)
      if (view === "week") return addDays(prev, direction * 7)
      if (view === "month" || view === "agenda") {
        const next = new Date(prev)
        next.setMonth(next.getMonth() + direction)
        return next
      }
      return addDays(prev, direction * 7)
    })
  }

  function openEvent(event: CalendarEvent) {
    setDetailsEvent(event)
    setDetailsOpen(true)
  }

  function handleCreate(start: Date, end: Date) {
    setCreateRange({ start, end })
    setCreateOpen(true)
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <div className="flex min-h-0 flex-1 flex-col">
          <CalendarsHeader
            rangeLabel={rangeLabel}
            view={view}
            onViewChange={setView}
            onToday={() => setFocusDate(new Date())}
            onPrev={() => shift(-1)}
            onNext={() => shift(1)}
            onSearch={() => setSearchOpen(true)}
            showTasks={showTasks}
            onToggleTasks={() => {
              if (!showTasks) ensureProjectData()
              toggleShowTasks()
            }}
          />
          {view === "month" ? (
            <MonthView
              focusDate={focusDate}
              onSelectDate={setFocusDate}
              onOpenEvent={openEvent}
            />
          ) : null}
          {view === "week" ? (
            <TimeGrid
              days={weekDays}
              onOpenEvent={openEvent}
              onCreate={handleCreate}
              onMove={moveEvent}
              onSelectDate={setFocusDate}
            />
          ) : null}
          {view === "day" ? (
            <TimeGrid
              days={[focusDate]}
              onOpenEvent={openEvent}
              onCreate={handleCreate}
              onMove={moveEvent}
              onSelectDate={setFocusDate}
            />
          ) : null}
          {view === "agenda" ? (
            <AgendaView focusDate={focusDate} onOpenEvent={openEvent} />
          ) : null}
          {view === "availability" ? (
            <AvailabilityView
              focusDate={focusDate}
              selectedMemberIds={selectedMemberIds}
              onOpenEvent={openEvent}
            />
          ) : null}
        </div>
      </div>

      <EventDetailsSheet
        event={detailsEvent}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      <CalendarsSearchCommand
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectEvent={(event) => {
          setFocusDate(new Date(event.startAt))
          openEvent(event)
        }}
      />

      <EventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultStart={createRange?.start}
        defaultEnd={createRange?.end}
        trigger={<span className="hidden" />}
      />
    </>
  )
}
