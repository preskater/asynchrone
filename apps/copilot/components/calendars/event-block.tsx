"use client"

import { useLocale, useTranslations } from "next-intl"

import { formatEventRange, formatTime } from "@workspace/calendars/date-utils"
import { EVENT_COLOR_CLASSES } from "@/lib/calendars/event-colors"
import type { CalendarEvent } from "@workspace/calendars/types"

export function EventChip({
  event,
  onClick,
  showTime = true,
  className = "",
}: {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
  showTime?: boolean
  className?: string
}) {
  const locale = useLocale()
  const styles = EVENT_COLOR_CLASSES[event.color]
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick(event)
      }}
      className={`flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-start text-xs leading-tight transition-colors hover:brightness-95 ${styles.chip} ${className}`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${styles.dot}`}
      />
      {showTime && !event.allDay ? (
        <span className="shrink-0 text-muted-foreground">
          {formatTime(new Date(event.startAt), locale)}
        </span>
      ) : null}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  )
}

export function EventBlock({
  event,
  top,
  height,
  leftPct,
  widthPct,
  onClick,
}: {
  event: CalendarEvent
  top: number
  height: number
  leftPct: number
  widthPct: number
  onClick: (event: CalendarEvent) => void
}) {
  const locale = useLocale()
  const t = useTranslations("Common")
  const styles = EVENT_COLOR_CLASSES[event.color]
  const range = formatEventRange(event, locale, t("allDay"))
  return (
    <button
      type="button"
      // Short blocks hide the time range, so screen readers get it from the label.
      aria-label={`${event.title}, ${range}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick(event)
      }}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-md border-s-2 px-1.5 py-1 text-start text-xs leading-tight shadow-sm transition-shadow hover:z-20 hover:shadow-md ${styles.block}`}
    >
      <span className="truncate font-medium">{event.title}</span>
      {height > 34 ? (
        <span className="truncate text-muted-foreground">{range}</span>
      ) : null}
    </button>
  )
}
