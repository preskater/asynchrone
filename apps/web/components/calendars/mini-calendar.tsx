"use client"

import * as React from "react"
import { useLocale } from "next-intl"
import { enUS, fr } from "react-day-picker/locale"

import { Calendar } from "@workspace/ui/components/calendar"

import { useCalendars } from "@/lib/calendars/store"
import { tasksOnDay } from "@/lib/calendars/tasks"
import { useProjectStore } from "@workspace/projects/store"

const DAY_PICKER_LOCALES = { en: enUS, fr }

export function MiniCalendar({
  focusDate,
  onSelectDate,
}: {
  focusDate: Date
  onSelectDate: (date: Date) => void
}) {
  const locale = useLocale()
  const { eventsOnDay, showTasks } = useCalendars()
  const { tasks } = useProjectStore()
  const eventDates = React.useMemo(() => {
    const dates: Date[] = []
    const cursor = new Date(focusDate)
    cursor.setDate(1)
    const month = cursor.getMonth()
    while (cursor.getMonth() === month) {
      const hasEvents = eventsOnDay(cursor).length > 0
      const hasTasks = showTasks && tasksOnDay(tasks, cursor).length > 0
      if (hasEvents || hasTasks) dates.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  }, [focusDate, eventsOnDay, showTasks, tasks])

  return (
    <Calendar
      mode="single"
      locale={DAY_PICKER_LOCALES[locale as keyof typeof DAY_PICKER_LOCALES]}
      selected={focusDate}
      month={focusDate}
      onMonthChange={onSelectDate}
      onSelect={(date) => date && onSelectDate(date)}
      modifiers={{ hasEvents: eventDates }}
      modifiersClassNames={{
        hasEvents:
          "relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
      }}
      className="p-1 [--cell-size:--spacing(7)]"
    />
  )
}
