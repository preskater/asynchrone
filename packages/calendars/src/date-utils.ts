import type { CalendarEvent } from "./types"

export const HOUR_HEIGHT = 56
export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 21
export const SNAP_MINUTES = 15

export function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export function addMonths(date: Date, amount: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + amount)
  return next
}

export function startOfWeek(date: Date, weekStartsOn = 1) {
  const day = startOfDay(date)
  const diff = (day.getDay() - weekStartsOn + 7) % 7
  return addDays(day, -diff)
}

export function endOfWeek(date: Date, weekStartsOn = 1) {
  return endOfDay(addDays(startOfWeek(date, weekStartsOn), 6))
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function eachDay(start: Date, end: Date) {
  const days: Date[] = []
  let cursor = startOfDay(start)
  const last = startOfDay(end)
  while (cursor <= last) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return days
}

export function buildMonthGrid(date: Date, weekStartsOn = 1) {
  const gridStart = startOfWeek(startOfMonth(date), weekStartsOn)
  const gridEnd = endOfWeek(endOfMonth(date), weekStartsOn)
  const days = eachDay(gridStart, gridEnd)
  const weeks: Date[][] = []
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }
  return weeks
}

export function minutesFromMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function snapMinutes(minutes: number, snap = SNAP_MINUTES) {
  return Math.round(minutes / snap) * snap
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function startOfEventDay(event: CalendarEvent, day: Date) {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)
  const dayStart = startOfDay(day)
  if (start < dayStart) return 0
  return minutesFromMidnight(start)
}

export function endOfEventDay(event: CalendarEvent, day: Date) {
  const end = new Date(event.endAt)
  const dayEnd = endOfDay(day)
  if (end > dayEnd) return 24 * 60
  return minutesFromMidnight(end)
}

export interface PositionedEvent {
  event: CalendarEvent
  top: number
  height: number
  leftPct: number
  widthPct: number
  column: number
  columns: number
}

export function eventOverlapsDay(event: CalendarEvent, day: Date) {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)
  return start <= endOfDay(day) && end >= startOfDay(day)
}

export function eventsOnDay(events: CalendarEvent[], day: Date) {
  return events
    .filter((event) => eventOverlapsDay(event, day))
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )
}

export function layoutDayEvents(
  events: CalendarEvent[],
  day: Date
): PositionedEvent[] {
  const timed = events
    .filter((event) => !event.allDay)
    .filter((event) => eventOverlapsDay(event, day))
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    )

  const groups: CalendarEvent[][] = []
  let current: CalendarEvent[] = []
  let currentEnd = -1

  for (const event of timed) {
    const start = startOfEventDay(event, day)
    if (current.length === 0 || start < currentEnd) {
      current.push(event)
      currentEnd = Math.max(currentEnd, endOfEventDay(event, day))
    } else {
      groups.push(current)
      current = [event]
      currentEnd = endOfEventDay(event, day)
    }
  }
  if (current.length) groups.push(current)

  const positioned: PositionedEvent[] = []
  for (const group of groups) {
    const columns = assignColumns(group, day)
    const columnCount = Math.max(...columns.map((entry) => entry.column)) + 1
    for (const entry of columns) {
      const start = startOfEventDay(entry.event, day)
      const end = endOfEventDay(entry.event, day)
      const top = ((start - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT
      const height = Math.max(
        ((end - start) / 60) * HOUR_HEIGHT,
        HOUR_HEIGHT / 2
      )
      positioned.push({
        event: entry.event,
        top,
        height,
        column: entry.column,
        columns: columnCount,
        leftPct: (entry.column / columnCount) * 100,
        widthPct: (1 / columnCount) * 100,
      })
    }
  }
  return positioned
}

function assignColumns(events: CalendarEvent[], day: Date) {
  const columns: number[] = []
  return events
    .map((event) => {
      const start = startOfEventDay(event, day)
      let column = 0
      while (column < columns.length && (columns[column] ?? 0) > start) {
        column += 1
      }
      columns[column] = endOfEventDay(event, day)
      return { event, column }
    })
    .sort(
      (a, b) => startOfEventDay(a.event, day) - startOfEventDay(b.event, day)
    )
}

export function formatTime(date: Date, locale = "en") {
  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatTimeShort(date: Date, locale = "en") {
  const minutes = date.getMinutes()
  if (minutes === 0) {
    return date
      .toLocaleTimeString(locale, { hour: "numeric" })
      .replace(":00", "")
  }
  return formatTime(date, locale)
}

export function formatMonthYear(date: Date, locale = "en") {
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" })
}

export function formatRange(
  start: Date,
  end: Date,
  view: string,
  locale = "en"
) {
  if (view === "month") return formatMonthYear(start, locale)
  if (view === "day") {
    return start.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })
  const endLabel = end.toLocaleDateString(locale, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  })
  return `${startLabel} – ${endLabel}`
}

export type DayLabelTranslator = (...args: never[]) => string

export function formatDayLabel(
  date: Date,
  locale = "en",
  t?: DayLabelTranslator
) {
  const today = startOfDay(new Date())
  const label = (key: string, fallback: string) => {
    if (!t) return fallback
    const translate = t as unknown as (key: string) => string
    return translate(`Common.${key}`)
  }
  if (isSameDay(date, today)) return label("today", "Today")
  const yesterday = addDays(today, -1)
  if (isSameDay(date, yesterday)) return label("yesterday", "Yesterday")
  const tomorrow = addDays(today, 1)
  if (isSameDay(date, tomorrow)) return label("tomorrow", "Tomorrow")
  return date.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export function formatEventRange(
  event: CalendarEvent,
  locale = "en",
  allDayLabel = "All day"
) {
  const start = new Date(event.startAt)
  const end = new Date(event.endAt)
  if (event.allDay) return allDayLabel
  return `${formatTime(start, locale)} – ${formatTime(end, locale)}`
}
