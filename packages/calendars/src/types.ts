export type EventColor = "blue" | "green" | "orange" | "red" | "purple"

export type AttendeeResponse = "accepted" | "tentative" | "declined" | "pending"

export type CalendarView = "day" | "week" | "month" | "agenda" | "availability"

export type CalendarKind = "personal" | "team"

export interface CalendarSource {
  id: string
  name: string
  color: EventColor
  kind: CalendarKind
  visible: boolean
  memberIds: string[]
}

export interface Attendee {
  memberId: string
  response: AttendeeResponse
}

export interface CalendarEvent {
  id: string
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  calendarId: string
  location?: string
  meetingUrl?: string
  meetingPassword?: string
  attendees: Attendee[]
  color: EventColor
  reminderMinutes?: number
  createdBy: string
}

export interface CalendarData {
  calendars: CalendarSource[]
  events: CalendarEvent[]
}

export const EVENT_COLORS: { value: EventColor; label: string }[] = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "orange", label: "Orange" },
  { value: "red", label: "Red" },
  { value: "purple", label: "Purple" },
]

export const REMINDERS: { label: string; value: string }[] = [
  { label: "No reminder", value: "none" },
  { label: "At start", value: "0" },
  { label: "5 minutes before", value: "5" },
  { label: "15 minutes before", value: "15" },
  { label: "30 minutes before", value: "30" },
  { label: "1 hour before", value: "60" },
]
