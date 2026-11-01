"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  addCalendarAction,
  createEventAction,
  listCalendarDataAction,
  deleteEventAction,
  listCalendarEventsAction,
  moveEventAction,
  respondToEventAction,
  toggleCalendarAction,
  updateEventAction,
} from "@/actions/calendars"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import type { Member } from "@/lib/projects/types"
import { useProjectStore } from "@/lib/projects/store"

import type {
  CalendarData,
  CalendarEvent,
  CalendarSource,
} from "@workspace/calendars/types"

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export interface EventInput {
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  calendarId: string
  location?: string
  meetingUrl?: string
  attendees: CalendarEvent["attendees"]
  color: CalendarEvent["color"]
  reminderMinutes?: number
}

interface CalendarStore extends CalendarData {
  members: Member[]
  currentUserId: string
  eventsLoaded: boolean
  /** Load the bounded event window the first time the calendar is opened. */
  ensureEventsLoaded: () => void
  getMember: (id?: string) => Member | undefined
  getCalendar: (id: string) => CalendarSource | undefined
  visibleEvents: CalendarEvent[]
  showTasks: boolean
  toggleShowTasks: () => void
  eventsInRange: (start: Date, end: Date) => CalendarEvent[]
  eventsOnDay: (date: Date) => CalendarEvent[]
  createEvent: (input: EventInput) => void
  updateEvent: (id: string, patch: Partial<EventInput>) => void
  deleteEvent: (id: string) => void
  moveEvent: (id: string, startAt: string, endAt: string) => void
  toggleCalendar: (id: string) => void
  addCalendar: (
    name: string,
    kind: CalendarSource["kind"],
    color: CalendarSource["color"]
  ) => void
  setAttendeeResponse: (
    eventId: string,
    response: CalendarEvent["attendees"][number]["response"]
  ) => void
}

const CalendarContext = React.createContext<CalendarStore | null>(null)

export function CalendarsProvider({
  children,
  initialData,
  currentUserId,
  members: initialMembers = [],
}: {
  children: React.ReactNode
  initialData: CalendarData
  currentUserId: string
  members?: Member[]
}) {
  const projectMembers = useProjectStore().members
  const members = initialMembers.length > 0 ? initialMembers : projectMembers

  const t = useTranslations("Toasts")
  const te = useErrorTranslator()
  const [calendars, setCalendars] = React.useState<CalendarSource[]>(
    initialData.calendars
  )
  const [events, setEvents] = React.useState<CalendarEvent[]>(
    initialData.events
  )
  const [showTasks, setShowTasks] = React.useState(false)
  const [eventsLoaded, setEventsLoaded] = React.useState(
    initialData.events.length > 0
  )
  const eventsLoadedRef = React.useRef(eventsLoaded)

  React.useEffect(() => {
    if (initialData.calendars.length === 0) {
      void listCalendarDataAction()
        .then((result) => {
          const data = unwrapActionResult(result)
          setCalendars(data.calendars)
          if (!eventsLoadedRef.current) setEvents(data.events)
        })
        .catch(() => {})
    }
  }, [initialData.calendars.length])

  React.useEffect(() => {
    setCalendars(initialData.calendars)
    if (!eventsLoadedRef.current) setEvents(initialData.events)
  }, [initialData])

  const ensureEventsLoaded = React.useCallback(() => {
    if (eventsLoadedRef.current) return
    eventsLoadedRef.current = true
    setEventsLoaded(true)
    void listCalendarEventsAction()
      .then((result) => {
        setEvents(unwrapActionResult(result))
      })
      .catch(() => {
        eventsLoadedRef.current = false
        setEventsLoaded(false)
      })
  }, [])

  const visibleIds = React.useMemo(
    () =>
      new Set(
        calendars
          .filter((calendar) => calendar.visible)
          .map((calendar) => calendar.id)
      ),
    [calendars]
  )
  const visibleEvents = React.useMemo(
    () => events.filter((event) => visibleIds.has(event.calendarId)),
    [events, visibleIds]
  )

  const store = React.useMemo<CalendarStore>(() => {
    const getMember = (id?: string) =>
      id ? members.find((member) => member.id === id) : undefined
    const getCalendar = (id: string) =>
      calendars.find((calendar) => calendar.id === id)

    return {
      calendars,
      events,
      members,
      currentUserId,
      eventsLoaded,
      ensureEventsLoaded,
      getMember,
      getCalendar,
      visibleEvents,
      showTasks,
      toggleShowTasks: () => setShowTasks((prev) => !prev),
      eventsInRange: (start, end) =>
        visibleEvents.filter((event) => {
          const eventStart = new Date(event.startAt)
          const eventEnd = new Date(event.endAt)
          return eventStart <= end && eventEnd >= start
        }),
      eventsOnDay: (date) =>
        visibleEvents.filter((event) => {
          const eventStart = new Date(event.startAt)
          const eventEnd = new Date(event.endAt)
          const dayStart = new Date(date)
          dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(date)
          dayEnd.setHours(23, 59, 59, 999)
          return eventStart <= dayEnd && eventEnd >= dayStart
        }),
      createEvent: (input) => {
        const optimistic: CalendarEvent = {
          id: uid("ev"),
          createdBy: currentUserId,
          ...input,
        }
        setEvents((prev) => [...prev, optimistic])
        void createEventAction(input)
          .then((result) => {
            const event = unwrapActionResult(result)
            setEvents((prev) =>
              prev.map((item) => (item.id === optimistic.id ? event : item))
            )
            toast.success(t("eventCreated", { title: event.title }))
          })
          .catch((error) => {
            setEvents((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "createEventFailed"))
          })
      },
      updateEvent: (id, patch) => {
        setEvents((prev) =>
          prev.map((event) =>
            event.id === id ? { ...event, ...patch } : event
          )
        )
        void updateEventAction(id, patch)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("eventUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      deleteEvent: (id) => {
        setEvents((prev) => prev.filter((event) => event.id !== id))
        void deleteEventAction(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("eventDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      moveEvent: (id, startAt, endAt) => {
        setEvents((prev) =>
          prev.map((event) =>
            event.id === id ? { ...event, startAt, endAt } : event
          )
        )
        void moveEventAction(id, { startAt, endAt })
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "moveFailed")))
      },
      toggleCalendar: (id) => {
        setCalendars((prev) =>
          prev.map((calendar) =>
            calendar.id === id
              ? { ...calendar, visible: !calendar.visible }
              : calendar
          )
        )
        void toggleCalendarAction(id)
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      addCalendar: (name, kind, color) => {
        const optimistic: CalendarSource = {
          id: uid("cal"),
          name,
          kind,
          color,
          visible: true,
          memberIds: [currentUserId],
        }
        setCalendars((prev) => [...prev, optimistic])
        void addCalendarAction({ name, kind, color })
          .then((result) => {
            const calendar = unwrapActionResult(result)
            setCalendars((prev) =>
              prev.map((item) => (item.id === optimistic.id ? calendar : item))
            )
            toast.success(t("calendarAdded", { name }))
          })
          .catch((error) => {
            setCalendars((prev) =>
              prev.filter((item) => item.id !== optimistic.id)
            )
            toast.error(te(error, "addCalendarFailed"))
          })
      },
      setAttendeeResponse: (eventId, response) => {
        setEvents((prev) =>
          prev.map((event) =>
            event.id === eventId
              ? {
                  ...event,
                  attendees: event.attendees.map((attendee) =>
                    attendee.memberId === currentUserId
                      ? { ...attendee, response }
                      : attendee
                  ),
                }
              : event
          )
        )
        void respondToEventAction(eventId, { response })
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
    }
  }, [
    calendars,
    events,
    members,
    currentUserId,
    visibleEvents,
    showTasks,
    eventsLoaded,
    ensureEventsLoaded,
  ])

  return (
    <CalendarContext.Provider value={store}>
      {children}
    </CalendarContext.Provider>
  )
}

export function useCalendars() {
  const context = React.useContext(CalendarContext)
  if (!context) {
    throw new Error("useCalendars must be used within a CalendarsProvider")
  }
  return context
}
