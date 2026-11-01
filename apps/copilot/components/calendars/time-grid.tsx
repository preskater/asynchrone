"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { EventBlock } from "@/components/calendars/event-block"
import { TaskChip } from "@/components/calendars/task-chip"
import { useTimeGridInteraction } from "@/components/calendars/use-calendars-drag"
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  dateKey,
  isSameDay,
  layoutDayEvents,
} from "@workspace/calendars/date-utils"
import { tasksOnDay } from "@/lib/calendars/tasks"
import { cn } from "@workspace/ui/lib/utils"

import { useCalendars } from "@/lib/calendars/store"
import { useProjectStore } from "@workspace/projects/store"
import type { CalendarEvent } from "@workspace/calendars/types"

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, index) => DAY_START_HOUR + index
)

function TimeColumn({
  day,
  events,
  onOpenEvent,
  onCreate,
  onMove,
}: {
  day: Date
  events: CalendarEvent[]
  onOpenEvent: (event: CalendarEvent) => void
  onCreate: (start: Date, end: Date) => void
  onMove: (id: string, startAt: string, endAt: string) => void
}) {
  const {
    columnRef,
    draft,
    preview,
    onSlotPointerDown,
    onEventPointerDown,
    onResizePointerDown,
  } = useTimeGridInteraction({ day, onCreate, onMove })

  const positioned = layoutDayEvents(events, day)

  return (
    <div
      ref={columnRef}
      className="relative flex-1 border-e last:border-e-0"
      onPointerDown={onSlotPointerDown}
    >
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="border-b border-border/60"
          style={{ height: HOUR_HEIGHT }}
        />
      ))}

      {positioned.map((item) => {
        const isActive = preview?.id === item.event.id
        const top = isActive ? minutesToTop(preview!.start) : item.top
        const height = isActive
          ? minutesToHeight(preview!.end - preview!.start)
          : item.height
        return (
          <div
            key={item.event.id}
            className="absolute"
            style={{
              top,
              height,
              left: `calc(${item.leftPct}% + 2px)`,
              width: `calc(${item.widthPct}% - 4px)`,
            }}
            onPointerDown={(event) => onEventPointerDown(event, item.event)}
          >
            <EventBlock
              event={item.event}
              top={0}
              height={height}
              leftPct={0}
              widthPct={100}
              onClick={onOpenEvent}
            />
            {isActive ? null : (
              // Pointer-only shortcut: keyboard users change the time in the event dialog.
              <div
                aria-hidden
                data-no-fx
                onPointerDown={(event) =>
                  onResizePointerDown(event, item.event)
                }
                className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
              />
            )}
          </div>
        )
      })}

      {draft ? (
        <div
          className="pointer-events-none absolute inset-x-1 rounded-md border border-primary/50 bg-primary/15"
          style={{
            top: minutesToTop(draft.start),
            height: minutesToHeight(draft.end - draft.start),
          }}
        />
      ) : null}
    </div>
  )
}

function minutesToTop(minutes: number) {
  return ((minutes - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT
}

function minutesToHeight(minutes: number) {
  return Math.max((minutes / 60) * HOUR_HEIGHT, HOUR_HEIGHT / 2)
}

export function TimeGrid({
  days,
  onOpenEvent,
  onCreate,
  onMove,
  onSelectDate,
}: {
  days: Date[]
  onOpenEvent: (event: CalendarEvent) => void
  onCreate: (start: Date, end: Date) => void
  onMove: (id: string, startAt: string, endAt: string) => void
  onSelectDate: (day: Date) => void
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const { visibleEvents, showTasks } = useCalendars()
  const { tasks } = useProjectStore()
  const today = new Date()
  const multiDay = days.length > 1

  const allDayEvents = visibleEvents.filter((event) => event.allDay)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b">
        <div className="w-16 shrink-0 border-e" />
        {days.map((day) => (
          <div
            key={dateKey(day)}
            className="flex flex-1 flex-col items-center gap-0.5 border-e py-2 last:border-e-0"
          >
            <span className="text-xs text-muted-foreground">
              {day.toLocaleDateString(locale, { weekday: "short" })}
            </span>
            <button
              type="button"
              onClick={() => onSelectDate(day)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-sm tabular-nums transition-colors hover:bg-muted",
                isSameDay(day, today) &&
                  "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {day.getDate()}
            </button>
          </div>
        ))}
      </div>

      <div className="flex border-b bg-muted/20">
        <div className="w-16 shrink-0 border-e py-1 pe-2 text-end text-xs text-muted-foreground">
          {t("allDayShort")}
        </div>
        {days.map((day) => {
          const dayAllDay = allDayEvents.filter((event) => {
            const start = new Date(event.startAt)
            const end = new Date(event.endAt)
            const dayStart = new Date(day)
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(day)
            dayEnd.setHours(23, 59, 59, 999)
            return start <= dayEnd && end >= dayStart
          })
          return (
            <div
              key={dateKey(day)}
              className="flex flex-1 flex-col gap-0.5 border-e p-1 last:border-e-0"
            >
              {dayAllDay.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onOpenEvent(event)}
                  className="truncate rounded bg-muted px-1.5 py-0.5 text-start text-xs font-medium hover:bg-muted/80"
                >
                  {event.title}
                </button>
              ))}
              {showTasks
                ? tasksOnDay(tasks, day).map((task) => (
                    <TaskChip key={task.id} task={task} />
                  ))
                : null}
            </div>
          )
        })}
      </div>

      <div tabIndex={0} className="flex min-h-0 flex-1 overflow-y-auto">
        <div className="w-16 shrink-0 border-e">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="border-b border-border/60 pe-2 text-end text-[0.7rem] text-muted-foreground"
              style={{ height: HOUR_HEIGHT }}
            >
              {hour === 0
                ? ""
                : new Date(2026, 0, 1, hour).toLocaleTimeString(locale, {
                    hour: "numeric",
                  })}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <TimeColumn
            key={dateKey(day)}
            day={day}
            events={visibleEvents}
            onOpenEvent={onOpenEvent}
            onCreate={onCreate}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  )
}
