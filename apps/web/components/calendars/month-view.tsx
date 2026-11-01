"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { EventChip } from "@/components/calendars/event-block"
import { TaskChip } from "@/components/calendars/task-chip"
import { EventTooltipContent } from "@/components/calendars/event-tooltip"
import {
  buildMonthGrid,
  isSameDay,
  isSameMonth,
} from "@workspace/calendars/date-utils"
import { tasksOnDay } from "@/lib/calendars/tasks"
import { cn } from "@workspace/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useCalendars } from "@/lib/calendars/store"
import { useProjectStore } from "@/lib/projects/store"
import type { CalendarEvent } from "@workspace/calendars/types"

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const MAX_VISIBLE = 3

export function MonthView({
  focusDate,
  onSelectDate,
  onOpenEvent,
}: {
  focusDate: Date
  onSelectDate: (date: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const t = useTranslations("Calendars")
  const { eventsOnDay, showTasks } = useCalendars()
  const { tasks } = useProjectStore()
  const weeks = buildMonthGrid(focusDate)
  const today = new Date()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAY_KEYS.map((key) => (
          <div
            key={key}
            className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {t(`weekdays.${key}`)}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-6">
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="grid grid-cols-7 border-b last:border-b-0"
          >
            {week.map((day) => {
              const dayEvents = eventsOnDay(day)
              const dayTasks = showTasks ? tasksOnDay(tasks, day) : []
              const visibleEvents = dayEvents.slice(0, MAX_VISIBLE)
              const overflow = dayEvents.length - visibleEvents.length
              const inMonth = isSameMonth(day, focusDate)
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    "flex min-h-24 flex-col gap-1 border-e p-1.5 transition-colors last:border-e-0",
                    inMonth ? "bg-background" : "bg-muted/30",
                    "hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday
                          ? "bg-primary font-semibold text-primary-foreground"
                          : inMonth
                            ? "text-foreground"
                            : "text-muted-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {visibleEvents.map((event) => (
                      <Tooltip key={event.id}>
                        <TooltipTrigger render={<span className="block" />}>
                          <EventChip event={event} onClick={onOpenEvent} />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-56 p-2">
                          <EventTooltipContent event={event} />
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {dayTasks
                      .slice(0, Math.max(0, MAX_VISIBLE - visibleEvents.length))
                      .map((task) => (
                        <TaskChip
                          key={task.id}
                          task={task}
                          className="text-primary"
                        />
                      ))}
                    {overflow > 0 ? (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          onSelectDate(day)
                        }}
                        className="px-1.5 text-start text-xs text-muted-foreground hover:text-foreground"
                      >
                        {t("moreCount", { count: overflow })}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
