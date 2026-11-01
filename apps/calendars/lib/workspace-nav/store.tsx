"use client"

import * as React from "react"

import { useCalendars } from "@/lib/calendars/store"
import type { CalendarView } from "@workspace/calendars/types"

/**
 * Calendar navigation state for the calendars host.
 *
 * The Copilot shell kept messages, files and calendars in one workspace store;
 * this app owns calendars only, so the store keeps exactly the calendar view,
 * focus date and attendee filter the screens share.
 */
interface CalendarNavStore {
  calendarView: CalendarView
  setCalendarView: (view: CalendarView) => void
  calendarFocusDate: Date
  setCalendarFocusDate: React.Dispatch<React.SetStateAction<Date>>
  calendarSelectedMemberIds: string[]
  toggleCalendarMember: (memberId: string) => void
}

const CalendarNavContext = React.createContext<CalendarNavStore | null>(null)

export function WorkspaceNavProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { members, currentUserId } = useCalendars()

  const [calendarView, setCalendarView] = React.useState<CalendarView>("week")
  const [calendarFocusDate, setCalendarFocusDate] = React.useState<Date>(
    () => new Date()
  )
  const [calendarSelectedMemberIds, setCalendarSelectedMemberIds] =
    React.useState<string[]>(() =>
      members
        .filter((member) => member.id !== currentUserId)
        .map((member) => member.id)
    )

  const store = React.useMemo<CalendarNavStore>(
    () => ({
      calendarView,
      setCalendarView,
      calendarFocusDate,
      setCalendarFocusDate,
      calendarSelectedMemberIds,
      toggleCalendarMember: (memberId) =>
        setCalendarSelectedMemberIds((prev) =>
          prev.includes(memberId)
            ? prev.filter((id) => id !== memberId)
            : [...prev, memberId]
        ),
    }),
    [calendarView, calendarFocusDate, calendarSelectedMemberIds]
  )

  return (
    <CalendarNavContext.Provider value={store}>
      {children}
    </CalendarNavContext.Provider>
  )
}

export function useWorkspaceNav() {
  const context = React.useContext(CalendarNavContext)
  if (!context) {
    throw new Error(
      "useWorkspaceNav must be used within a WorkspaceNavProvider"
    )
  }
  return context
}
