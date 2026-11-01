"use client"

import * as React from "react"

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  SNAP_MINUTES,
  clamp,
  snapMinutes,
} from "@workspace/calendars/date-utils"
import type { CalendarEvent } from "@workspace/calendars/types"

export interface DraftRange {
  start: number
  end: number
}

export interface DragPreview {
  kind: "move" | "resize"
  id: string
  start: number
  end: number
}

type DragState =
  | { kind: "create"; anchor: number; current: number }
  | {
      kind: "move"
      id: string
      start: number
      end: number
      pointerStart: number
    }
  | { kind: "resize"; id: string; start: number; end: number }

const MIN_MINUTES = DAY_START_HOUR * 60
const MAX_MINUTES = DAY_END_HOUR * 60

export function useTimeGridInteraction({
  day,
  onCreate,
  onMove,
}: {
  day: Date
  onCreate: (start: Date, end: Date) => void
  onMove: (id: string, startAt: string, endAt: string) => void
}) {
  const columnRef = React.useRef<HTMLDivElement>(null)
  const [drag, setDrag] = React.useState<DragState | null>(null)

  const yToMinutes = React.useCallback((clientY: number) => {
    const rect = columnRef.current?.getBoundingClientRect()
    if (!rect) return MIN_MINUTES
    const minutes = ((clientY - rect.top) / HOUR_HEIGHT) * 60
    return clamp(snapMinutes(minutes + DAY_START_HOUR * 60), MIN_MINUTES, MAX_MINUTES)
  }, [])

  const minutesToDate = React.useCallback(
    (minutes: number) => {
      const date = new Date(day)
      date.setHours(0, 0, 0, 0)
      date.setMinutes(minutes)
      return date
    },
    [day]
  )

  React.useEffect(() => {
    if (!drag) return

    function onMoveEvent(event: PointerEvent) {
      setDrag((prev) => {
        if (!prev) return prev
        if (prev.kind === "create") {
          return { ...prev, current: yToMinutes(event.clientY) }
        }
        if (prev.kind === "move") {
          const delta = yToMinutes(event.clientY) - prev.pointerStart
          const duration = prev.end - prev.start
          const start = clamp(
            snapMinutes(prev.start + delta),
            MIN_MINUTES,
            MAX_MINUTES - duration
          )
          return { ...prev, start, end: start + duration }
        }
        const end = clamp(
          yToMinutes(event.clientY),
          prev.start + SNAP_MINUTES,
          MAX_MINUTES
        )
        return { ...prev, end }
      })
    }

    function onUp() {
      setDrag((prev) => {
        if (!prev) return prev
        if (prev.kind === "create") {
          const start = Math.min(prev.anchor, prev.current)
          const end = Math.max(prev.anchor, prev.current)
          const safeEnd = end - start < SNAP_MINUTES ? start + 60 : end
          onCreate(minutesToDate(start), minutesToDate(safeEnd))
        } else if (prev.kind === "move") {
          onMove(
            prev.id,
            minutesToDate(prev.start).toISOString(),
            minutesToDate(prev.end).toISOString()
          )
        } else {
          onMove(
            prev.id,
            minutesToDate(prev.start).toISOString(),
            minutesToDate(prev.end).toISOString()
          )
        }
        return null
      })
    }

    window.addEventListener("pointermove", onMoveEvent)
    window.addEventListener("pointerup", onUp)
    return () => {
      window.removeEventListener("pointermove", onMoveEvent)
      window.removeEventListener("pointerup", onUp)
    }
  }, [drag, yToMinutes, minutesToDate, onCreate, onMove])

  const onSlotPointerDown = React.useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return
      const minutes = yToMinutes(event.clientY)
      setDrag({ kind: "create", anchor: minutes, current: minutes })
    },
    [yToMinutes]
  )

  const onEventPointerDown = React.useCallback(
    (event: React.PointerEvent, calendarEvent: CalendarEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const start = new Date(calendarEvent.startAt)
      const end = new Date(calendarEvent.endAt)
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = end.getHours() * 60 + end.getMinutes()
      setDrag({
        kind: "move",
        id: calendarEvent.id,
        start: startMinutes,
        end: endMinutes,
        pointerStart: yToMinutes(event.clientY),
      })
    },
    [yToMinutes]
  )

  const onResizePointerDown = React.useCallback(
    (event: React.PointerEvent, calendarEvent: CalendarEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const start = new Date(calendarEvent.startAt)
      const end = new Date(calendarEvent.endAt)
      setDrag({
        kind: "resize",
        id: calendarEvent.id,
        start: start.getHours() * 60 + start.getMinutes(),
        end: end.getHours() * 60 + end.getMinutes(),
      })
    },
    []
  )

  const draft: DraftRange | null =
    drag?.kind === "create"
      ? {
          start: Math.min(drag.anchor, drag.current),
          end: Math.max(drag.anchor, drag.current),
        }
      : null

  const preview: DragPreview | null =
    drag && drag.kind !== "create"
      ? { kind: drag.kind as "move" | "resize", id: drag.id, start: drag.start, end: drag.end }
      : null

  return {
    columnRef,
    draft,
    preview,
    onSlotPointerDown,
    onEventPointerDown,
    onResizePointerDown,
  }
}
