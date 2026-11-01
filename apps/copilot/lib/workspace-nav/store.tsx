"use client"

import * as React from "react"

import { useCalendars } from "@/lib/calendars/store"
import type { CalendarView } from "@workspace/calendars/types"
import type { FileLocation } from "@workspace/files/types"

interface WorkspaceNavStore {
  filesLocation: FileLocation
  filesFolderId: string | null
  selectFileLocation: (location: FileLocation) => void
  openFileFolder: (folderId: string | null) => void

  calendarView: CalendarView
  setCalendarView: (view: CalendarView) => void
  calendarFocusDate: Date
  setCalendarFocusDate: React.Dispatch<React.SetStateAction<Date>>
  calendarSelectedMemberIds: string[]
  toggleCalendarMember: (memberId: string) => void
}

const WorkspaceNavContext = React.createContext<WorkspaceNavStore | null>(null)

export function WorkspaceNavProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { members, currentUserId } = useCalendars()

  const [filesLocation, setFilesLocation] =
    React.useState<FileLocation>("my-files")
  const [filesFolderId, setFilesFolderId] = React.useState<string | null>(null)
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

  const store = React.useMemo<WorkspaceNavStore>(
    () => ({
      filesLocation,
      filesFolderId,
      selectFileLocation: (location) => {
        setFilesLocation(location)
        setFilesFolderId(null)
      },
      openFileFolder: (folderId) => {
        setFilesLocation("my-files")
        setFilesFolderId(folderId)
      },
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
    [
      filesLocation,
      filesFolderId,
      calendarView,
      calendarFocusDate,
      calendarSelectedMemberIds,
    ]
  )

  return (
    <WorkspaceNavContext.Provider value={store}>
      {children}
    </WorkspaceNavContext.Provider>
  )
}

export function useWorkspaceNav() {
  const context = React.useContext(WorkspaceNavContext)
  if (!context) {
    throw new Error(
      "useWorkspaceNav must be used within a WorkspaceNavProvider"
    )
  }
  return context
}
