"use client"

import * as React from "react"

import { useCalendars } from "@/lib/calendars/store"
import type { CalendarView } from "@workspace/calendars/types"
import type { FileLocation } from "@workspace/files/types"
import { useMessaging } from "@workspace/messaging/store"

interface WorkspaceNavStore {
  messagesActiveId: string | undefined
  selectConversation: (id: string) => void
  messagesSearchOpen: boolean
  setMessagesSearchOpen: (open: boolean) => void

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
  const { conversations } = useMessaging()

  const [messagesActiveId, setMessagesActiveId] = React.useState<
    string | undefined
  >(() => conversations[0]?.id)

  // The shell hydrates conversations after mount; select the first one once
  // they are available instead of staying on an empty screen.
  React.useEffect(() => {
    if (!messagesActiveId && conversations[0]) {
      setMessagesActiveId(conversations[0].id)
    }
  }, [conversations, messagesActiveId])
  const [messagesSearchOpen, setMessagesSearchOpen] = React.useState(false)
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
      messagesActiveId,
      selectConversation: setMessagesActiveId,
      messagesSearchOpen,
      setMessagesSearchOpen,
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
      messagesActiveId,
      messagesSearchOpen,
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
